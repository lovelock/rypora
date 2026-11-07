use std::sync::Arc;

use jieba_rs::{Jieba, TokenizeMode};
use tantivy::schema::{
    Field, IndexRecordOption, Schema, TextFieldIndexing, TextOptions, FAST, STORED, STRING,
};
use tantivy::tokenizer::{Token, TokenStream, Tokenizer};
use tantivy::Index;

pub const SCHEMA_VERSION: u32 = 1;
pub const TOKENIZER_VERSION: u32 = 1;
pub const JIEBA_TOKENIZER: &str = "jieba";

pub struct IndexSchema {
    pub schema: Schema,
    pub path: Field,
    pub rel_path: Field,
    pub title: Field,
    pub body: Field,
    pub mtime: Field,
}

pub fn build_schema() -> IndexSchema {
    let mut builder = Schema::builder();

    let path = builder.add_text_field("path", STRING | STORED);
    let rel_path = builder.add_text_field("rel_path", STORED);
    let title = builder.add_text_field("title", STORED);
    let body = builder.add_text_field(
        "body",
        TextOptions::default()
            .set_stored()
            .set_indexing_options(
                TextFieldIndexing::default()
                    .set_tokenizer(JIEBA_TOKENIZER)
                    .set_index_option(IndexRecordOption::WithFreqsAndPositions),
            ),
    );
    let mtime = builder.add_u64_field("mtime", FAST | STORED);

    IndexSchema {
        schema: builder.build(),
        path,
        rel_path,
        title,
        body,
        mtime,
    }
}

pub fn register_tokenizers(index: &Index) {
    index
        .tokenizers()
        .register(JIEBA_TOKENIZER, JiebaTokenizer::new());
}

#[derive(Clone)]
pub struct JiebaTokenizer {
    jieba: Arc<Jieba>,
}

impl JiebaTokenizer {
    pub fn new() -> Self {
        Self {
            jieba: Arc::new(Jieba::new()),
        }
    }
}

impl Default for JiebaTokenizer {
    fn default() -> Self {
        Self::new()
    }
}

impl Tokenizer for JiebaTokenizer {
    type TokenStream<'a> = JiebaTokenStream;

    fn token_stream<'a>(&'a mut self, text: &'a str) -> Self::TokenStream<'a> {
        let mut position = 0usize;
        let tokens = self
            .jieba
            .tokenize(text, TokenizeMode::Search, true)
            .into_iter()
            .filter_map(|token| {
                let word = token.word.to_lowercase();
                if word.trim().is_empty() {
                    return None;
                }
                let item = Token {
                    offset_from: token.byte_start,
                    offset_to: token.byte_end,
                    position,
                    text: word,
                    position_length: 1,
                };
                position += 1;
                Some(item)
            })
            .collect();

        JiebaTokenStream {
            tokens,
            index: 0,
            current: Token::default(),
        }
    }
}

pub struct JiebaTokenStream {
    tokens: Vec<Token>,
    index: usize,
    current: Token,
}

impl JiebaTokenStream {
    pub fn new(tokens: Vec<Token>) -> Self {
        Self {
            tokens,
            index: 0,
            current: Token::default(),
        }
    }
}

impl TokenStream for JiebaTokenStream {
    fn advance(&mut self) -> bool {
        if self.index >= self.tokens.len() {
            return false;
        }
        self.current = self.tokens[self.index].clone();
        self.index += 1;
        true
    }

    fn token(&self) -> &Token {
        &self.current
    }

    fn token_mut(&mut self) -> &mut Token {
        &mut self.current
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tokens(text: &str) -> Vec<String> {
        let mut tokenizer = JiebaTokenizer::new();
        let mut stream = tokenizer.token_stream(text);
        let mut out = Vec::new();
        while stream.advance() {
            out.push(stream.token().text.clone());
        }
        out
    }

    #[test]
    fn tokenizes_chinese_in_search_mode() {
        let result = tokens("我的笔记本很好用");
        assert!(result.contains(&"笔记".to_string()), "{result:?}");
        assert!(result.contains(&"笔记本".to_string()), "{result:?}");
    }

    #[test]
    fn lowercases_english() {
        let result = tokens("Hello World");
        assert!(result.contains(&"hello".to_string()), "{result:?}");
        assert!(result.contains(&"world".to_string()), "{result:?}");
    }

    #[test]
    fn builds_expected_fields() {
        let schema = build_schema();
        assert_eq!(schema.schema.get_field_name(schema.path), "path");
        assert_eq!(schema.schema.get_field_name(schema.body), "body");
        assert_eq!(schema.schema.get_field_name(schema.mtime), "mtime");
    }
}

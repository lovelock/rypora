use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tantivy::collector::TopDocs;
use tantivy::query::{
    BooleanQuery, EmptyQuery, Occur, PhraseQuery, Query, TermQuery,
};
use tantivy::schema::{IndexRecordOption, TantivyDocument, Value};
use tantivy::snippet::SnippetGenerator;
use tantivy::{Index, IndexReader, Term};
use tantivy::tokenizer::{TokenStream, Tokenizer};

use super::schema::{IndexSchema, JiebaTokenizer};
use crate::error::WorkspaceError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextHit {
    pub path: String,
    pub rel_path: String,
    pub title: String,
    pub score: f32,
    pub snippet_html: String,
    pub term: String,
    pub line: u32,
}

pub fn find_term_line(body: &str, term: &str) -> u32 {
    if term.is_empty() {
        return 1;
    }
    let lower_body = body.to_lowercase();
    let lower_term = term.to_lowercase();
    let offset = lower_body.find(&lower_term).unwrap_or(0);
    body[..offset.min(body.len())].matches('\n').count() as u32 + 1
}

fn tokenize(text: &str) -> Vec<String> {
    let mut tokenizer = JiebaTokenizer::new();
    let mut stream = tokenizer.token_stream(text);
    let mut tokens = Vec::new();
    while stream.advance() {
        tokens.push(stream.token().text.clone());
    }
    tokens
}

fn split_segments(raw: &str) -> Vec<(bool, String)> {
    let mut segments = Vec::new();
    let mut buffer = String::new();
    let mut in_quote = false;

    for ch in raw.chars() {
        if ch == '"' {
            if in_quote {
                segments.push((true, std::mem::take(&mut buffer)));
                in_quote = false;
            } else {
                if !buffer.is_empty() {
                    segments.push((false, std::mem::take(&mut buffer)));
                }
                in_quote = true;
            }
        } else {
            buffer.push(ch);
        }
    }

    if !buffer.is_empty() {
        // An unbalanced quote is treated as literal text.
        segments.push((in_quote, buffer));
    }
    segments
}

fn build_query(schema: &IndexSchema, raw: &str) -> (Box<dyn Query>, String) {
    let mut clauses: Vec<(Occur, Box<dyn Query>)> = Vec::new();
    let mut first_term = String::new();

    for (is_phrase, text) in split_segments(raw) {
        let tokens = tokenize(&text);
        if first_term.is_empty() {
            first_term = tokens.first().cloned().unwrap_or_default();
        }
        if tokens.is_empty() {
            continue;
        }

        if is_phrase && tokens.len() > 1 {
            let terms = tokens
                .iter()
                .map(|token| Term::from_field_text(schema.body, token))
                .collect();
            clauses.push((Occur::Should, Box::new(PhraseQuery::new(terms))));
        } else {
            for token in tokens {
                clauses.push((
                    Occur::Should,
                    Box::new(TermQuery::new(
                        Term::from_field_text(schema.body, &token),
                        IndexRecordOption::WithFreqsAndPositions,
                    )),
                ));
            }
        }
    }

    if clauses.is_empty() {
        (Box::new(EmptyQuery), first_term)
    } else {
        (Box::new(BooleanQuery::new(clauses)), first_term)
    }
}

pub fn search(
    _index: &Index,
    reader: &IndexReader,
    schema: &IndexSchema,
    raw_query: &str,
    exclude: &[String],
    limit: usize,
) -> Result<Vec<TextHit>, WorkspaceError> {
    let query = raw_query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let (parsed, term) = build_query(schema, query);
    let searcher = reader.searcher();
    let top = searcher
        .search(parsed.as_ref(), &TopDocs::with_limit(100))
        .map_err(|error| WorkspaceError::Io(error.to_string()))?;

    let mut snippet_generator =
        SnippetGenerator::create(&searcher, parsed.as_ref(), schema.body).ok();
    if let Some(generator) = snippet_generator.as_mut() {
        generator.set_max_num_chars(180);
    }

    let now = now_ms();
    let mut hits = Vec::new();

    for (score, address) in top {
        let document: TantivyDocument = searcher
            .doc(address)
            .map_err(|error| WorkspaceError::Io(error.to_string()))?;

        let path = document
            .get_first(schema.path)
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();
        if exclude.iter().any(|excluded| excluded == &path) {
            continue;
        }

        let rel_path = document
            .get_first(schema.rel_path)
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();
        let title = document
            .get_first(schema.title)
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();
        let body = document
            .get_first(schema.body)
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();
        let mtime = document
            .get_first(schema.mtime)
            .and_then(|value| value.as_u64())
            .unwrap_or(0);

        let title_boost = if !term.is_empty() && title.to_lowercase().contains(&term) {
            1.25
        } else {
            1.0
        };
        let age_days = now.saturating_sub(mtime) as f64 / 86_400_000.0;
        let recency = (-age_days / 90.0).exp() as f32;
        let final_score = score * title_boost * (1.0 + 0.15 * recency);

        let snippet_html = snippet_generator
            .as_ref()
            .map(|generator| generator.snippet(&body).to_html())
            .filter(|snippet| !snippet.is_empty())
            .unwrap_or_else(|| escape_html(&body.chars().take(180).collect::<String>()));

        hits.push(TextHit {
            path,
            rel_path,
            title,
            score: final_score,
            snippet_html,
            term: term.clone(),
            line: find_term_line(&body, &term),
        });
    }

    hits.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    hits.truncate(limit);
    Ok(hits)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::schema::build_schema;
    use crate::index::storage::open_or_create;
    use std::fs;
    use tempfile::tempdir;
    use tantivy::IndexWriter;

    fn writer(index: &Index) -> IndexWriter<TantivyDocument> {
        index.writer::<TantivyDocument>(50_000_000).unwrap()
    }

    fn add(
        writer: &IndexWriter<TantivyDocument>,
        schema: &IndexSchema,
        path: &str,
        title: &str,
        body: &str,
        mtime: u64,
    ) {
        let mut document = TantivyDocument::default();
        document.add_text(schema.path, path);
        document.add_text(schema.rel_path, path.trim_start_matches('/'));
        document.add_text(schema.title, title);
        document.add_text(schema.body, body);
        document.add_u64(schema.mtime, mtime);
        writer.add_document(document).unwrap();
    }

    #[test]
    fn finds_chinese_substrings() {
        let temp = tempdir().unwrap();
        let schema = build_schema();
        let index = open_or_create(temp.path(), &schema).unwrap();
        let reader = index.reader().unwrap();
        let mut w = writer(&index);
        add(
            &mut w,
            &schema,
            "/w/a.md",
            "a",
            "我的笔记本很好用",
            1,
        );
        w.commit().unwrap();
        reader.reload().unwrap();

        let hits = search(&index, &reader, &schema, "笔记", &[], 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].line, 1);
        assert!(hits[0].snippet_html.contains("<b>"));
    }

    #[test]
    fn boosts_title_matches() {
        let temp = tempdir().unwrap();
        let schema = build_schema();
        let index = open_or_create(temp.path(), &schema).unwrap();
        let reader = index.reader().unwrap();
        let mut w = writer(&index);
        add(&mut w, &schema, "/w/a.md", "rust", "rust guide", 1);
        add(&mut w, &schema, "/w/b.md", "other", "rust guide", 1);
        w.commit().unwrap();
        reader.reload().unwrap();

        let hits = search(&index, &reader, &schema, "rust", &[], 10).unwrap();
        assert_eq!(hits[0].title, "rust");
    }

    #[test]
    fn excludes_paths() {
        let temp = tempdir().unwrap();
        let schema = build_schema();
        let index = open_or_create(temp.path(), &schema).unwrap();
        let reader = index.reader().unwrap();
        let mut w = writer(&index);
        add(&mut w, &schema, "/w/a.md", "a", "rust", 1);
        w.commit().unwrap();
        reader.reload().unwrap();

        let hits = search(
            &index,
            &reader,
            &schema,
            "rust",
            &["/w/a.md".to_string()],
            10,
        )
        .unwrap();
        assert!(hits.is_empty());
    }

    #[test]
    fn treats_special_characters_literally() {
        let temp = tempdir().unwrap();
        let schema = build_schema();
        let index = open_or_create(temp.path(), &schema).unwrap();
        let reader = index.reader().unwrap();
        let mut w = writer(&index);
        add(&mut w, &schema, "/w/a.md", "a", "C++ guide", 1);
        add(&mut w, &schema, "/w/b.md", "b", "a AND b", 1);
        w.commit().unwrap();
        reader.reload().unwrap();

        assert!(!search(&index, &reader, &schema, "C++", &[], 10).unwrap().is_empty());
        assert!(search(&index, &reader, &schema, "\"rust", &[], 10).unwrap().is_empty());
    }

    #[test]
    fn escapes_snippets_and_finds_lines() {
        assert_eq!(find_term_line("a\nb\n笔记", "笔记"), 3);
        assert_eq!(escape_html("<script>"), "&lt;script&gt;");
    }
}

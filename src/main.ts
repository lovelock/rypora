import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { applyPlatform } from "./lib/utils/platform";

applyPlatform(document.documentElement);

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;

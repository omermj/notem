import { mount } from "svelte";
import App from "./App.svelte";
import "./styles/base.css";
import "./styles/themes/light.css";
import "./styles/themes/dark.css";

const target = document.getElementById("app");

if (!target) {
  throw new Error("Unable to find the NoteM application mount point.");
}

mount(App, { target });

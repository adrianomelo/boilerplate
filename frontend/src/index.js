import { Elm } from './Main.elm'

// This will be replaced at build time, falls back to localhost for development
const injectedApiUrl = "__API_URL__";
const apiUrl = injectedApiUrl.startsWith("http") ? injectedApiUrl : "http://localhost:3000";

const app = Elm.Main.init({
    node: document.getElementById("elm-app"),
    flags: { apiUrl: apiUrl }
}); 
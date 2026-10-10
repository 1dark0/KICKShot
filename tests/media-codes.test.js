const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { codificarImagem, decodificarImagem } = require("../media-codes.js");

test("codifica links HTTPS do Catbox em códigos curtos", () => {
    assert.equal(codificarImagem("https://files.catbox.moe/image_123.png"), "image_123_png");
});

test("não codifica links fora do domínio HTTPS permitido", () => {
    assert.equal(codificarImagem("http://files.catbox.moe/image.png"), null);
    assert.equal(codificarImagem("https://example.com/image.png"), null);
});

test("decodifica códigos curtos para links do Catbox", () => {
    assert.equal(decodificarImagem("image_123_webm"), "https://files.catbox.moe/image_123.webm");
});

test("mantém compatibilidade com códigos antigos em Base64URL", () => {
    const url = "https://files.catbox.moe/legacy-image.png";
    const codigo = Buffer.from(url).toString("base64url");

    assert.equal(decodificarImagem(codigo), url);
});

test("rejeita códigos e tipos inválidos", () => {
    assert.equal(decodificarImagem("arquivo_outraext"), null);
    assert.equal(decodificarImagem("https://example.com/image.png"), null);
    assert.equal(decodificarImagem(null), null);
});

test("carrega o módulo antes do content script nos dois navegadores", () => {
    const chromeManifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
    const firefoxManifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "Firefox", "manifest.json"), "utf8"));
    const chromeScripts = chromeManifest.content_scripts[0].js;
    const firefoxScripts = firefoxManifest.content_scripts[0].js;

    assert.deepEqual(chromeScripts, ["media-codes.js", "content.js"]);
    assert.deepEqual(firefoxScripts, ["media-codes.js", "content.js"]);
});

test("não marca o content script como iniciado antes de validar o módulo", () => {
    const contentScript = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
    const moduleCheck = contentScript.indexOf("if (!globalThis.KICKShotMediaCodes)");
    const startedFlag = contentScript.indexOf("globalThis.__KICKSHOT_CONTENT_SCRIPT_STARTED__ = true");

    assert.notEqual(moduleCheck, -1);
    assert.notEqual(startedFlag, -1);
    assert.ok(moduleCheck < startedFlag);
});

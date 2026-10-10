const assert = require("node:assert/strict");
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

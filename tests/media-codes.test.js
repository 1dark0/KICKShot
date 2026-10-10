const assert = require("node:assert/strict");
const { createHash, webcrypto } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const mediaCodesModules = [
    require("../media-codes.js"),
    require("../Firefox/media-codes.js")
];
const { codificarImagem, decodificarImagem, decodificarCodigoImagem, montarMensagemComMidia, separarMensagemComMidia } = mediaCodesModules[0];

test("codifica links HTTPS do Catbox em códigos curtos", () => {
    for (const mediaCodes of mediaCodesModules) {
        assert.equal(mediaCodes.codificarImagem("https://files.catbox.moe/image_123.png"), "KMC_image_123_png_IMG");
        assert.equal(mediaCodes.codificarImagem("https://files.catbox.moe/animation.gif"), "KMC_animation_gif_GIF");
    }
});

test("não codifica links fora do domínio HTTPS permitido", () => {
    assert.equal(codificarImagem("http://files.catbox.moe/image.png"), null);
    assert.equal(codificarImagem("https://example.com/image.png"), null);
});

test("decodifica códigos curtos para links do Catbox", () => {
    assert.equal(decodificarImagem("image_123_webm"), "https://files.catbox.moe/image_123.webm");
});

test("decodifica códigos identificados com .IMG ou .GIF e preserva o formato antigo", () => {
    for (const mediaCodes of mediaCodesModules) {
        assert.equal(mediaCodes.decodificarCodigoImagem("KMC_image_123_png_IMG"), "https://files.catbox.moe/image_123.png");
        assert.equal(mediaCodes.decodificarCodigoImagem("KMC_image_123_gif_GIF"), "https://files.catbox.moe/image_123.gif");
        assert.equal(mediaCodes.decodificarCodigoImagem("KMC_image_123_png.IMG"), "https://files.catbox.moe/image_123.png");
        assert.equal(mediaCodes.decodificarCodigoImagem("KMC_image_123_gif.GIF"), "https://files.catbox.moe/image_123.gif");
        assert.equal(mediaCodes.decodificarCodigoImagem("KMCIMG_image_123_png"), "https://files.catbox.moe/image_123.png");
    }
});

test("adiciona _GIF aos GIFs GIPHY e ainda entende códigos antigos", () => {
    for (const mediaCodes of mediaCodesModules) {
        const codigoNovo = mediaCodes.codificarCodigoGiphy("gif123");
        assert.equal(codigoNovo, "gph:gif123_GIF");
        assert.equal(mediaCodes.decodificarCodigoGiphy(codigoNovo), "gif123");
        assert.equal(mediaCodes.decodificarCodigoGiphy("gph:gif123"), "gif123");
        assert.equal(mediaCodes.decodificarCodigoGiphy("gph:gif123.GIF"), "gif123");
        assert.equal(mediaCodes.codificarCodigoGiphy("id com espaço"), null);
    }
});

test("usa o código GIPHY terminado em _GIF na busca, prévia e leitura do chat", () => {
    for (const arquivo of ["../content.js", "../Firefox/content.js"]) {
        const contentScript = fs.readFileSync(path.join(__dirname, arquivo), "utf8");

        assert.match(contentScript, /codificarCodigoGiphy\(id\)/);
        assert.match(contentScript, /criarImagemGiphy\(decodificarCodigoGiphy\(tag\)/);
        assert.match(contentScript, /const idGiphy = decodificarCodigoGiphy\(texto\)/);
    }
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

test("coloca a mensagem opcional antes do código da mídia", () => {
    const mensagem = montarMensagemComMidia("  mensagem  ", "KMCIMG_nw2hdp_png");
    assert.equal(mensagem, "mensagem KMCIMG_nw2hdp_png");
    assert.deepEqual(separarMensagemComMidia(mensagem), {
        antes: "mensagem",
        codigo: "KMCIMG_nw2hdp_png",
        depois: ""
    });
});

test("envia somente o código da mídia sem inserir texto adicional", () => {
    for (const mediaCodes of mediaCodesModules) {
        const mensagemGif = mediaCodes.montarMensagemComMidia("", "gph:UCl0NcfQEPPTOoiezU_GIF");
        const mensagemImagem = mediaCodes.montarMensagemComMidia("", "KMC_image_123_png_IMG");
        assert.equal(mensagemGif, "gph:UCl0NcfQEPPTOoiezU_GIF");
        assert.equal(mensagemImagem, "KMC_image_123_png_IMG");
        assert.equal(mediaCodes.decodificarCodigoGiphy("gph:UCl0NcfQEPPTOoiezUÉUMGIFCARALHO_GIF"), null);
        assert.equal(mediaCodes.decodificarCodigoImagem("KMC_image_123_pngÉUMAIMAGEMCARALHO_IMG"), null);
        assert.deepEqual(mediaCodes.separarMensagemComMidia(mensagemGif), {
            antes: "",
            codigo: "gph:UCl0NcfQEPPTOoiezU_GIF",
            depois: ""
        });
        const mensagemComLegenda = mediaCodes.montarMensagemComMidia("olha isso", "tnr:gif123");
        assert.equal(mensagemComLegenda, "olha isso tnr:gif123");
        assert.deepEqual(mediaCodes.separarMensagemComMidia(mensagemComLegenda), {
            antes: "olha isso",
            codigo: "tnr:gif123",
            depois: ""
        });
    }
});

test("separa mensagens com códigos identificados de imagem e GIF", () => {
    assert.deepEqual(
        separarMensagemComMidia("foto KMC_nw2hdp_png_IMG"),
        { antes: "foto", codigo: "KMC_nw2hdp_png_IMG", depois: "" }
    );
    assert.deepEqual(
        separarMensagemComMidia("animação KMC_nw2hdp_gif_GIF"),
        { antes: "animação", codigo: "KMC_nw2hdp_gif_GIF", depois: "" }
    );
    assert.deepEqual(
        separarMensagemComMidia("reação gph:gif123_GIF"),
        { antes: "reação", codigo: "gph:gif123_GIF", depois: "" }
    );
});

test("usa o código gerado pelo módulo em ambos os navegadores", () => {
    for (const arquivo of ["../content.js", "../Firefox/content.js"]) {
        const contentScript = fs.readFileSync(path.join(__dirname, arquivo), "utf8");

        assert.match(contentScript, /valor = codigo;/);
        assert.match(contentScript, /decodificarCodigoImagem\(encontrado\[0\]\)/);
    }
});

test("não carrega mídias bloqueadas no chat em nenhum dos navegadores", () => {
    for (const arquivo of ["../content.js", "../Firefox/content.js"]) {
        const contentScript = fs.readFileSync(path.join(__dirname, arquivo), "utf8");
        const bloqueio = contentScript.indexOf("if (midiasBloqueadasKMC.includes(chaveBloqueio))");
        const limpaFonte = contentScript.indexOf('midia.removeAttribute("src")', bloqueio);
        const carregaFonte = contentScript.indexOf("midia.src = fonteMidia", bloqueio);

        assert.notEqual(bloqueio, -1);
        assert.ok(limpaFonte > bloqueio);
        assert.ok(carregaFonte > limpaFonte);
        assert.match(contentScript, /localStorage\.getItem\("kmc_hashes_midias_bloqueadas"\)/);
        assert.match(contentScript, /hashesMidiasBloqueadasKMC\.includes\(hash\)/);
        assert.match(contentScript, /localStorage\.getItem\("kmc_mapa_hashes_midias_bloqueadas"\)/);
        assert.match(contentScript, /chavesDoHash\.has\(item\)/);
        assert.match(contentScript, /imagem\.dataset\.kmcSrc\s*=/);
        assert.match(contentScript, /video\.dataset\.kmcSrc\s*=/);
    }
});

test("carrega a mídia selecionada na prévia do painel nos dois navegadores", () => {
    for (const arquivo of ["../content.js", "../Firefox/content.js"]) {
        const contentScript = fs.readFileSync(path.join(__dirname, arquivo), "utf8");
        const inicio = contentScript.indexOf("function atualizarLinkColado()");
        const fim = contentScript.indexOf('\ndocument.getElementById("kmc-url").addEventListener', inicio);
        const corpo = contentScript.slice(inicio, fim);

        assert.notEqual(inicio, -1);
        assert.match(corpo, /media\.dataset\.kmcSrc/);
        assert.match(corpo, /media\.src = media\.dataset\.kmcSrc/);
        assert.ok(corpo.indexOf("media.src = media.dataset.kmcSrc") < corpo.indexOf("preview.replaceChildren(media)"));
    }
});

test("calcula hash SHA-256 da mídia permitida nos backgrounds Chrome e Firefox", async () => {
    const conteudo = new TextEncoder().encode("conteúdo de teste da mídia");
    const hashEsperado = createHash("sha256").update(conteudo).digest("hex");

    for (const arquivo of ["../background.js", "../Firefox/background.js"]) {
        const listeners = [];
        let urlBuscada;
        const evento = { addListener: () => {} };
        const chromeApi = {
            runtime: {
                onMessage: { addListener: listener => listeners.push(listener) },
                onInstalled: evento,
                onStartup: evento
            },
            tabs: {
                onUpdated: evento,
                query: async () => [],
                get: async () => ({})
            },
            scripting: { executeScript: async () => {} }
        };

        vm.runInNewContext(fs.readFileSync(path.join(__dirname, arquivo), "utf8"), {
            chrome: chromeApi,
            URL,
            AbortController,
            setTimeout,
            clearTimeout,
            crypto: webcrypto,
            fetch: async (url, options) => {
                urlBuscada = String(url);
                assert.equal(options.credentials, "omit");
                const resposta = new Response(conteudo, {
                    status: 200,
                    headers: { "content-length": String(conteudo.byteLength) }
                });
                Object.defineProperty(resposta, "url", { value: urlBuscada });
                return resposta;
            },
            console: { warn() {} }
        });

        const listener = listeners[listeners.length - 1];
        assert.ok(listener, `handler de hash ausente em ${arquivo}`);

        const resposta = await new Promise(resolve => {
            listener(
                { tipo: "KMC_HASH_MIDIA", url: "https://files.catbox.moe/image.png" },
                { url: "https://kick.com/chat" },
                resolve
            );
        });

        assert.equal(urlBuscada, "https://files.catbox.moe/image.png");
        assert.deepEqual(JSON.parse(JSON.stringify(resposta)), { sucesso: true, hash: hashEsperado });

        let respostaHostNaoPermitido;
        assert.equal(listener(
            { tipo: "KMC_HASH_MIDIA", url: "https://example.com/image.png" },
            { url: "https://kick.com/chat" },
            resposta => { respostaHostNaoPermitido = resposta; }
        ), false);
        assert.equal(respostaHostNaoPermitido.sucesso, false);
        assert.equal(urlBuscada, "https://files.catbox.moe/image.png");
    }
});

test("preserva o envio da mídia sem texto opcional", () => {
    const imagem = montarMensagemComMidia("", "KMCIMG_nw2hdp_png");
    const gif = montarMensagemComMidia("   ", "tnr:gif123");
    assert.equal(imagem, "KMCIMG_nw2hdp_png");
    assert.equal(gif, "tnr:gif123");
});

test("separa o texto antes e depois do código da mídia", () => {
    assert.deepEqual(
        separarMensagemComMidia("antes KMCIMG_nw2hdp_png depois"),
        { antes: "antes", codigo: "KMCIMG_nw2hdp_png", depois: "depois" }
    );
    assert.deepEqual(
        separarMensagemComMidia("gph:gif123 fim"),
        { antes: "", codigo: "gph:gif123", depois: "fim" }
    );
    assert.equal(separarMensagemComMidia("mensagem sem mídia"), null);
});

test("mostra o texto digitado junto da prévia de mídia nos dois navegadores", () => {
    for (const arquivo of ["../content.js", "../Firefox/content.js"]) {
        const contentScript = fs.readFileSync(path.join(__dirname, arquivo), "utf8");

        assert.match(contentScript, /id="kmc-message-preview"/);
        assert.match(contentScript, /id="kmc-image-preview-media"/);
        assert.match(contentScript, /document\.getElementById\("kmc-caption"\)\.addEventListener\("input", atualizarPreviaMensagemKMC\)/);
        assert.match(contentScript, /previewMensagem\.textContent = mensagem/);
    }
});

test("exibe a prévia do arquivo selecionado nos dois navegadores", () => {
    for (const arquivo of ["../content.js", "../Firefox/content.js"]) {
        const contentScript = fs.readFileSync(path.join(__dirname, arquivo), "utf8");
        const start = contentScript.indexOf("function mostrarPreviewImagem(file)");
        const end = contentScript.indexOf("\nasync function transformarImagemSelecionada", start);
        const functionBody = contentScript.slice(start, end);

        assert.notEqual(start, -1);
        assert.match(functionBody, /atualizarPreviaMensagemKMC\(\)/);
        assert.doesNotMatch(functionBody, /preview\.style\.display = "block"/);
    }
});

test("carrega sugestões GIPHY ao abrir a busca e ao limpar o termo nos dois navegadores", () => {
    for (const arquivo of ["../content.js", "../Firefox/content.js"]) {
        const contentScript = fs.readFileSync(path.join(__dirname, arquivo), "utf8");

        assert.match(contentScript, /campoBuscaGifsKMC\.value\.trim\(\) \|\| "trending"/);
        assert.match(contentScript, /if \(!resultadosGifsKMC\.childElementCount\) buscarGifsKMC\(\)/);
        assert.match(contentScript, /campoBuscaGifsKMC\.focus\(\);\s*buscarGifsKMC\(\);/);
    }
});

test("não mostra a frase de instrução antiga no painel de GIFs", () => {
    for (const arquivo of ["../content.js", "../Firefox/content.js"]) {
        const contentScript = fs.readFileSync(path.join(__dirname, arquivo), "utf8");
        assert.doesNotMatch(contentScript, /Pesquise GIFs e selecione um para preparar o envio/);
    }
});

const KICKSHOT_MATCH = "https://kick.com/*";

function kickshotIsKickPage(url) {
    try {
        return new URL(url).origin === "https://kick.com";
    } catch (erro) {
        return false;
    }
}

async function kickshotInject(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ["media-codes.js", "content.js"],
            world: "ISOLATED"
        });
    } catch (erro) {
        console.warn("KICKShot: não foi possível carregar o script na página da Kick:", erro);
    }
}

async function kickshotInjectOpenTabs() {
    try {
        const tabs = await chrome.tabs.query({ url: KICKSHOT_MATCH });
        for (const tab of tabs) {
            if (Number.isInteger(tab.id)) void kickshotInject(tab.id);
        }
    } catch (erro) {
        console.warn("KICKShot: não foi possível procurar abas da Kick:", erro);
    }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && kickshotIsKickPage(tab.url)) {
        void kickshotInject(tabId);
    }
});

chrome.runtime.onInstalled.addListener(() => void kickshotInjectOpenTabs());
chrome.runtime.onStartup.addListener(() => void kickshotInjectOpenTabs());
chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
    if (!mensagem || mensagem.tipo !== "KMC_UPLOAD_IMAGEM") {
        return false;
    }

    // Aceita uploads apenas das páginas da Kick onde o content script roda.
    try {
        if (!remetente || !remetente.url || new URL(remetente.url).origin !== "https://kick.com") {
            return false;
        }
    } catch (erro) {
        return false;
    }

    (async () => {
        try {
            const dadosBase64 = mensagem.dadosBase64;
            if (
                typeof dadosBase64 !== "string" ||
                !dadosBase64 ||
                dadosBase64.length % 4 !== 0 ||
                !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(dadosBase64)
            ) {
                throw new Error("Os dados da imagem estão inválidos.");
            }

            const mime = String(mensagem.mime || "").toLowerCase();
            if (!/^image\/[a-z0-9.+-]+$/.test(mime)) {
                throw new Error("O arquivo precisa ser uma imagem válida.");
            }

            const nomeOriginal = String(mensagem.nome || "imagem.png").split(/[\\/]/).pop();
            const nomeSeguro = nomeOriginal.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120) || "imagem.png";

            const binario = atob(dadosBase64);
            const bytes = new Uint8Array(binario.length);
            for (let i = 0; i < binario.length; i++) {
                bytes[i] = binario.charCodeAt(i);
            }

            const dados = new FormData();
            dados.append("reqtype", "fileupload");
            dados.append("fileToUpload", new Blob([bytes], { type: mime }), nomeSeguro);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);
            let resposta;
            try {
                resposta = await fetch("https://catbox.moe/user/api.php", {
                    method: "POST",
                    body: dados,
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timeout);
            }

            if (!resposta.ok) {
                throw new Error("Catbox respondeu HTTP " + resposta.status + ".");
            }

            const texto = (await resposta.text()).trim();
            let url;
            try {
                url = new URL(texto);
            } catch (erro) {
                throw new Error("Catbox não retornou um link válido.");
            }

            if (
                url.protocol !== "https:" ||
                url.hostname !== "files.catbox.moe" ||
                url.pathname === "/"
            ) {
                throw new Error("Catbox retornou um endereço inesperado.");
            }

            responder({ sucesso: true, url: url.href });
        } catch (erro) {
            console.error("KickMediaChat - erro no upload:", erro);
            responder({
                sucesso: false,
                erro: erro && erro.name === "AbortError"
                    ? "O upload demorou demais. Tente novamente."
                    : (erro && erro.message ? erro.message : String(erro))
            });
        }
    })();

    return true;
});

// Busca de GIFs pelo Worker da KICKShot; a chave do GIPHY fica somente no servidor.
chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
    if (!mensagem || mensagem.tipo !== "KMC_BUSCAR_GIFS") return false;

    try {
        if (!remetente?.url || new URL(remetente.url).origin !== "https://kick.com") return false;
    } catch (erro) {
        return false;
    }

    const consulta = typeof mensagem.consulta === "string" ? mensagem.consulta.trim().slice(0, 80) : "";
    if (!consulta) {
        responder({ sucesso: false, erro: "Digite algo para buscar." });
        return false;
    }

    (async () => {
        try {
            const url = new URL("https://kickshot-giphy.darkartz75.workers.dev/search");
            url.searchParams.set("q", consulta);
            const resposta = await fetch(url);
            if (!resposta.ok) throw new Error("O servidor respondeu HTTP " + resposta.status + ".");
            const dados = await resposta.json();
            const gifs = Array.isArray(dados.gifs) ? dados.gifs.slice(0, 12) : [];
            responder({ sucesso: true, gifs });
        } catch (erro) {
            console.error("KICKShot: erro na busca de GIFs:", erro);
            responder({ sucesso: false, erro: "Não foi possível buscar GIFs agora. Tente novamente." });
        }
    })();

    return true;
});

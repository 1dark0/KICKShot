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

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
    if (!mensagem || mensagem.tipo !== "KMC_HASH_MIDIA") return false;

    try {
        if (!remetente?.url || new URL(remetente.url).origin !== "https://kick.com") return false;
    } catch (erro) {
        return false;
    }

    const hostsPermitidos = new Set([
        "files.catbox.moe",
        "media.giphy.com",
        "media1.giphy.com",
        "i.giphy.com",
        "media.tenor.com",
        "c.tenor.com",
        "media1.tenor.com"
    ]);
    let url;
    try {
        if (typeof mensagem.url !== "string" || mensagem.url.length > 2048) {
            throw new Error("O endereço da mídia é inválido.");
        }
        url = new URL(mensagem.url);
        if (url.protocol !== "https:" || !hostsPermitidos.has(url.hostname) || url.username || url.password) {
            throw new Error("Este endereço de mídia não pode ser verificado.");
        }
    } catch (erro) {
        responder({ sucesso: false, erro: erro.message || "O endereço da mídia é inválido." });
        return false;
    }

    (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        let reader;
        try {
            const resposta = await fetch(url.href, {
                credentials: "omit",
                redirect: "follow",
                signal: controller.signal
            });
            const urlFinal = new URL(resposta.url);
            if (urlFinal.protocol !== "https:" || !hostsPermitidos.has(urlFinal.hostname)) {
                throw new Error("O servidor redirecionou para um endereço de mídia não permitido.");
            }
            if (!resposta.ok) {
                throw new Error("O servidor da mídia respondeu HTTP " + resposta.status + ".");
            }
            if (!resposta.body) {
                throw new Error("O navegador não conseguiu ler o arquivo da mídia.");
            }

            const tamanhoDeclarado = Number(resposta.headers.get("content-length"));
            const tamanhoMaximo = 25 * 1024 * 1024;
            if (Number.isFinite(tamanhoDeclarado) && tamanhoDeclarado > tamanhoMaximo) {
                throw new Error("O arquivo é grande demais para verificar automaticamente.");
            }

            reader = resposta.body.getReader();
            const partes = [];
            let tamanho = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                tamanho += value.byteLength;
                if (tamanho > tamanhoMaximo) {
                    await reader.cancel();
                    throw new Error("O arquivo é grande demais para verificar automaticamente.");
                }
                partes.push(value);
            }

            const bytes = new Uint8Array(tamanho);
            let deslocamento = 0;
            for (const parte of partes) {
                bytes.set(parte, deslocamento);
                deslocamento += parte.byteLength;
            }
            const digest = await crypto.subtle.digest("SHA-256", bytes);
            const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
            responder({ sucesso: true, hash });
        } catch (erro) {
            console.warn("KICKShot: não foi possível calcular a impressão digital da mídia:", erro);
            responder({
                sucesso: false,
                erro: erro?.name === "AbortError"
                    ? "A verificação da mídia demorou demais."
                    : (erro?.message || String(erro))
            });
        } finally {
            clearTimeout(timeout);
            if (reader) {
                try {
                    reader.releaseLock();
                } catch (erro) {
                    console.warn("KICKShot: não foi possível liberar o leitor da mídia:", erro);
                }
            }
        }
    })();

    return true;
});

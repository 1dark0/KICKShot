(function (root, factory) {
    const api = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    } else {
        root.KICKShotMediaCodes = api;
    }
})(globalThis, function () {
    function codificarImagem(url) {
        try {
            const endereco = new URL(url);
            if (endereco.protocol !== "https:" || endereco.hostname !== "files.catbox.moe") return null;
            const nomeArquivo = decodeURIComponent(endereco.pathname.slice(1));
            if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]{1,10})?$/.test(nomeArquivo)) return null;
            // Evita que a Kick transforme o tipo da mídia em link.
            const extensaoTipo = /\.gif$/i.test(nomeArquivo) ? "_GIF" : "_IMG";
            return "KMC_" + nomeArquivo.replace(/\./g, "_") + extensaoTipo;
        } catch (erro) {
            console.error("KickMediaChat: não foi possível encurtar o link da imagem:", erro);
            return null;
        }
    }

    function decodificarImagem(codigo) {
        if (typeof codigo !== "string") return null;

        // Códigos antigos usam Base64URL; códigos curtos novos não devem passar por essa conversão.
        if (/^aHR0cHM[A-Za-z0-9_-]*$/.test(codigo) && codigo.length % 4 !== 1) {
            try {
                let base64 = codigo.replace(/-/g, "+").replace(/_/g, "/");
                base64 += "=".repeat((4 - base64.length % 4) % 4);
                const binario = atob(base64);
                const bytes = Uint8Array.from(binario, caractere => caractere.charCodeAt(0));
                const urlAntiga = new TextDecoder().decode(bytes);
                if (/^https:\/\/files\.catbox\.moe\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]{1,10})?$/i.test(urlAntiga)) return urlAntiga;
            } catch (erro) {
                // Tenta reconhecer o formato curto abaixo.
            }
        }

        // Formato curto: identificador e extensão separados por sublinhado.
        const curto = codigo.match(/^([A-Za-z0-9_-]+)_(gif|png|jpe?g|webp|avif|heic|mp4|webm|mov)$/i);
        if (curto) return "https://files.catbox.moe/" + curto[1] + "." + curto[2];

        return null;
    }

    function decodificarCodigoImagem(codigo) {
        if (typeof codigo !== "string") return null;
        const payload = codigo
            .replace(/^KMC_/i, "")
            .replace(/[._](?:IMG|GIF)$/i, "")
            .replace(/^KMCIMG_/i, "");
        return decodificarImagem(payload);
    }

    function codificarCodigoGiphy(id) {
        if (typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
        return "gph:" + id + "_GIF";
    }

    function decodificarCodigoGiphy(codigo) {
        if (typeof codigo !== "string") return null;
        const id = codigo
            .replace(/^gph:/i, "")
            .replace(/[._]GIF$/i, "");
        return /^gph:/i.test(codigo) && /^[A-Za-z0-9_-]+$/.test(id) ? id : null;
    }

    function montarMensagemComMidia(texto, codigo) {
        const mensagem = String(texto || "").trim();
        return mensagem ? mensagem + " " + codigo : codigo;
    }

    function separarMensagemComMidia(texto) {
        const mensagem = String(texto || "");
        const prefixosCodigo = /^(?:KMC_|KMCIMG_|KMCGIF_TNR_|gph:|tnr:|img:https%3A%2F%2F)/i;
        const formatoCodigo = /^(?:KMC_[A-Za-z0-9_.-]+[._](?:IMG|GIF)|KMCIMG_[A-Za-z0-9_.-]+|KMCGIF_TNR_[A-Za-z0-9_.-]+|gph:[A-Za-z0-9_.-]+|tnr:[A-Za-z0-9_.-]+|img:https%3A%2F%2F[A-Za-z0-9%._~-]+)$/i;
        const tokens = [...mensagem.matchAll(/\S+/g)];
        for (const token of tokens) {
            if (!prefixosCodigo.test(token[0])) continue;
            const codigo = token[0];
            if (!formatoCodigo.test(codigo)) continue;
            return {
                antes: mensagem.slice(0, token.index).trim(),
                codigo,
                depois: mensagem.slice(token.index + token[0].length).trim()
            };
        }
        return null;
    }

    return Object.freeze({ codificarImagem, decodificarImagem, decodificarCodigoImagem, codificarCodigoGiphy, decodificarCodigoGiphy, montarMensagemComMidia, separarMensagemComMidia });
});

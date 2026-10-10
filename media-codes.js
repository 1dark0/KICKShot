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
            // O sublinhado evita que a Kick trate a extensão do arquivo como link.
            return nomeArquivo.replace(/\./g, "_");
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

    return Object.freeze({ codificarImagem, decodificarImagem });
});

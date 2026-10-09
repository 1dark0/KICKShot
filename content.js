(() => {
    if (globalThis.__KICKSHOT_CONTENT_SCRIPT_STARTED__) return;
    globalThis.__KICKSHOT_CONTENT_SCRIPT_STARTED__ = true;
const SELETOR_CAMPO_EDITAVEL = 'textarea, input, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';
const codigosColadosRecentementeKMC = new Map();
let codigoColadoAguardandoEnvioKMC = false;
let campoCodigoColadoKMC = null;

function inserirTextoColadoKMC(campo, texto) {
    if (!campo) return false;
    campo.focus();

    if (campo instanceof HTMLTextAreaElement || campo instanceof HTMLInputElement) {
        const inicio = campo.selectionStart ?? campo.value.length;
        const fim = campo.selectionEnd ?? inicio;
        campo.setRangeText(texto, inicio, fim, "end");
        campo.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: texto
        }));
        return true;
    }

    // Reaproveita o cursor do editor para inserir texto simples, sem HTML/link.
    if (document.execCommand("insertText", false, texto)) return true;

    const selecao = window.getSelection();
    const intervalo = selecao && selecao.rangeCount > 0
        ? selecao.getRangeAt(0)
        : document.createRange();
    if (!campo.contains(intervalo.commonAncestorContainer)) {
        intervalo.selectNodeContents(campo);
        intervalo.collapse(false);
    }
    intervalo.deleteContents();
    const noTexto = document.createTextNode(texto);
    intervalo.insertNode(noTexto);
    intervalo.setStartAfter(noTexto);
    intervalo.collapse(true);
    selecao?.removeAllRanges();
    selecao?.addRange(intervalo);
    campo.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: texto
    }));
    return true;
}

// Protege também o instante entre colar o texto e a Kick atualizar o editor.
document.addEventListener("paste", evento => {
    const alvo = evento.target instanceof Element
        ? evento.target.closest(SELETOR_CAMPO_EDITAVEL)
        : null;
    if (alvo) alvo.setAttribute("data-kmc-chat-input", "true");

    const textoOriginal = evento.clipboardData?.getData("text/plain") || "";
    const texto = textoOriginal;

    if (alvo && texto !== textoOriginal) {
        evento.preventDefault();
        inserirTextoColadoKMC(alvo, texto);
    }

    const codigos = texto.match(/(?:KMCIMG_[A-Za-z0-9_.-]+|KMCGIF_TNR_[A-Za-z0-9_.-]+|gph:[A-Za-z0-9_.-]+|tnr:[A-Za-z0-9_.-]+)/gi) || [];
    if (codigos.length) {
        codigoColadoAguardandoEnvioKMC = true;
        campoCodigoColadoKMC = alvo;
    }

    for (const codigo of codigos) {
        // Infinity significa: aguarde até o código sair do editor (envio).
        codigosColadosRecentementeKMC.set(codigo.toLowerCase(), Infinity);
    }
}, true);

// Marca o editor pelo próprio foco/entrada de texto da pessoa, sem depender
// de placeholder ou das mudanças de estrutura que a Kick faz na página.
document.addEventListener("focusin", evento => {
    const alvo = evento.target instanceof Element
        ? evento.target.closest(SELETOR_CAMPO_EDITAVEL)
        : null;
    if (alvo) alvo.setAttribute("data-kmc-chat-input", "true");
}, true);

document.addEventListener("input", evento => {
    const elementoEvento = evento.target instanceof Element
        ? evento.target
        : null;
    const alvo = elementoEvento?.closest(SELETOR_CAMPO_EDITAVEL) || elementoEvento;
    if (alvo) {
        if (alvo.matches?.(SELETOR_CAMPO_EDITAVEL)) {
            alvo.setAttribute("data-kmc-chat-input", "true");
        }
        const conteudo = alvo.value ?? alvo.innerText ?? alvo.textContent ?? "";
        const codigos = String(conteudo).match(/(?:KMCIMG_[A-Za-z0-9_.-]+|KMCGIF_TNR_[A-Za-z0-9_.-]+|gph:[A-Za-z0-9_.-]+|tnr:[A-Za-z0-9_.-]+)/gi) || [];
        if (codigos.length) {
            codigoColadoAguardandoEnvioKMC = true;
            campoCodigoColadoKMC = alvo;
        } else if (alvo === campoCodigoColadoKMC) {
            codigoColadoAguardandoEnvioKMC = false;
            campoCodigoColadoKMC = null;
        }
        for (const codigo of codigos) {
            codigosColadosRecentementeKMC.set(codigo.toLowerCase(), Infinity);
        }
    }
}, true);

function liberarCodigosColadosKMC(campo) {
    if (!campo) return;
    const conteudo = campo.value ?? campo.innerText ?? campo.textContent ?? "";
    const codigos = String(conteudo).match(/(?:KMCIMG_[A-Za-z0-9_.-]+|KMCGIF_TNR_[A-Za-z0-9_.-]+|gph:[A-Za-z0-9_.-]+|tnr:[A-Za-z0-9_.-]+)/gi) || [];
    if (!codigos.length) return;
    codigoColadoAguardandoEnvioKMC = false;
    campoCodigoColadoKMC = null;
    for (const codigo of codigos) {
        const chave = codigo.toLowerCase();
        if (codigosColadosRecentementeKMC.has(chave)) {
            // Marca como liberado pelo envio. A mensagem publicada no chat
            // será convertida assim que a Kick a inserir na página.
            codigosColadosRecentementeKMC.set(chave, 0);
        }
    }
    agendarBuscaDeMidiaDepoisDoEnvioKMC();
}

function reconciliarProtecaoDeCodigoColadoKMC() {
    if (!codigoColadoAguardandoEnvioKMC) return;

    const campo = campoCodigoColadoKMC;
    const texto = campo?.isConnected
        ? String(campo.value ?? campo.innerText ?? campo.textContent ?? "")
        : "";
    const aindaNoCampo = /(?:KMCIMG_[A-Za-z0-9_.-]+|KMCGIF_TNR_[A-Za-z0-9_.-]+|gph:[A-Za-z0-9_.-]+|tnr:[A-Za-z0-9_.-]+)/i.test(texto);
    if (aindaNoCampo) return;

    codigoColadoAguardandoEnvioKMC = false;
    campoCodigoColadoKMC = null;
    for (const [codigo, expiraEm] of codigosColadosRecentementeKMC) {
        if (expiraEm === Infinity) codigosColadosRecentementeKMC.set(codigo, 0);
    }
}

function agendarBuscaDeMidiaDepoisDoEnvioKMC() {
    for (const atraso of [150, 450, 900, 1600]) {
        setTimeout(() => {
            reconciliarProtecaoDeCodigoColadoKMC();
            procurarGifsNoChat();
        }, atraso);
    }
}

function liberarProtecaoAoDetectarMensagemKMC(elemento) {
    if (!codigoColadoAguardandoEnvioKMC || !elemento) return false;
    if (
        elemento.closest?.(SELETOR_CAMPO_EDITAVEL) ||
        elemento.closest?.('[data-kmc-chat-input="true"]') ||
        elemento.closest?.("#kmc-button, #kmc-panel, #kmc-gif-panel")
    ) return false;

    const texto = elemento.textContent || "";
    const codigos = texto.match(/(?:KMCIMG_[A-Za-z0-9_.-]+|KMCGIF_TNR_[A-Za-z0-9_.-]+|gph:[A-Za-z0-9_.-]+|tnr:[A-Za-z0-9_.-]+)/gi) || [];
    const codigoEnviado = codigos.find(codigo =>
        codigosColadosRecentementeKMC.has(codigo.toLowerCase())
    );
    if (!codigoEnviado) return false;

    for (const codigo of codigos) {
        if (codigosColadosRecentementeKMC.has(codigo.toLowerCase())) {
            codigosColadosRecentementeKMC.set(codigo.toLowerCase(), 0);
        }
    }
    codigoColadoAguardandoEnvioKMC = false;
    campoCodigoColadoKMC = null;
    agendarBuscaDeMidiaDepoisDoEnvioKMC();
    return true;
}

document.addEventListener("keydown", evento => {
    if (evento.key !== "Enter" || evento.shiftKey || evento.isComposing) return;
    const alvo = evento.target instanceof Element ? evento.target : null;
    const campo = alvo
        ? (alvo.closest(SELETOR_CAMPO_EDITAVEL) || (alvo === campoCodigoColadoKMC ? alvo : null))
        : null;
    liberarCodigosColadosKMC(campo);
}, true);

document.addEventListener("submit", evento => {
    const formulario = evento.target;
    const campo = formulario instanceof Element
        ? formulario.querySelector(SELETOR_CAMPO_EDITAVEL)
        : null;
    liberarCodigosColadosKMC(campo);
}, true);

document.addEventListener("click", evento => {
    const botao = evento.target instanceof Element
        ? evento.target.closest('button, [role="button"]')
        : null;
    const rotulo = botao
        ? `${botao.getAttribute("aria-label") || ""} ${botao.getAttribute("title") || ""} ${botao.textContent || ""}`.toLowerCase()
        : "";
    if (!botao || !/(send|enviar)/i.test(rotulo)) return;
    liberarCodigosColadosKMC(encontrarCampoChat());
}, true);

const botao = document.createElement("button");

botao.id = "kmc-button";
botao.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm0 16H5l4.2-5.6 2.8 3.4 2.8-3.7L19 19ZM8 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/>
    </svg>`;
botao.title = "KICKShot";
botao.setAttribute("aria-label", "Abrir o KICKShot");

Object.assign(botao.style, {
    position: "fixed",
    zIndex: "999996",
    width: "34px",
    height: "34px",
    padding: "0",
    border: "none",
    borderRadius: "0",
    background: "transparent",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "none",
    display: "none",
    alignItems: "center",
    justifyContent: "center"
});

document.body.appendChild(botao);

const estilosKMC = document.createElement("style");
estilosKMC.textContent = `
    #kmc-panel, #kmc-gif-panel {
        transform-origin: bottom right;
        outline: 1px solid transparent;
        outline-offset: 0;
    }
    #kmc-button svg { transition: transform .18s ease; }
    #kmc-button:hover svg { transform: scale(1.12); }
    #kmc-panel, #kmc-gif-panel {
        box-sizing: border-box !important;
        font-family: Inter, system-ui, sans-serif !important;
        color: #f4f4f5 !important;
        background: #18181b !important;
        border: 1px solid #34343a !important;
        box-shadow: 0 12px 36px rgba(0,0,0,.48) !important;
        backdrop-filter: blur(10px);
    }
    #kmc-panel {
        width: min(320px, calc(100vw - 24px)) !important;
        max-height: calc(100vh - 24px);
        overflow-y: auto;
        padding: 18px !important;
    }
    #kmc-gif-panel {
        width: min(440px, calc(100vw - 24px)) !important;
        height: min(540px, calc(100vh - 24px)) !important;
        padding: 18px !important;
    }
    #kmc-gif-scroll-area {
        height: min(365px, calc(100vh - 220px)) !important;
        scrollbar-width: thin;
        scrollbar-color: #555 #222;
    }
    #kmc-panel h3, #kmc-gif-panel h3 {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin: 0 0 16px !important;
        font-size: 17px;
        font-weight: 700;
    }
    #kmc-panel button, #kmc-gif-panel button {
        box-sizing: border-box;
        border: 1px solid #3b3b42 !important;
        border-radius: 8px !important;
        background: #27272a !important;
        color: #f4f4f5 !important;
        font: inherit !important;
        font-weight: 600 !important;
        transition: background .15s ease, border-color .15s ease, transform .15s ease;
    }
    #kmc-panel button:hover, #kmc-gif-panel button:hover {
        background: #35353b !important;
        border-color: #53fc18 !important;
    }
    #kmc-panel button:active, #kmc-gif-panel button:active { transform: scale(.98); }
    #kmc-panel #kmc-send {
        border-color: #53fc18 !important;
        background: #53fc18 !important;
        color: #101010 !important;
        position: sticky;
        bottom: 0;
        z-index: 5;
        margin-top: 4px;
    }
    #kmc-panel #kmc-send:hover { background: #71ff45 !important; }
    #kmc-panel input, #kmc-gif-panel input {
        box-sizing: border-box;
        min-width: 0;
        border: 1px solid #3b3b42 !important;
        border-radius: 8px !important;
        outline: none;
        background: #202024 !important;
        color: #fff !important;
        font: inherit !important;
    }
    #kmc-panel input:focus, #kmc-gif-panel input:focus {
        border-color: #53fc18 !important;
        box-shadow: 0 0 0 2px rgba(83,252,24,.16);
    }
    #kmc-panel #kmc-drop { transition: border-color .15s ease, background .15s ease; }
    #kmc-panel #kmc-drop:hover { border-color: #53fc18 !important; background: #202a1d; color: #fff !important; }
    #kmc-panel #kmc-close, #kmc-gif-panel #kmc-gif-close {
        flex: 0 0 30px;
        width: 30px !important;
        height: 30px;
        padding: 0 !important;
        border-radius: 50% !important;
        font-size: 20px !important;
        line-height: 1;
    }
    #kmc-gif-panel #kmc-gif-close {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        color: #fff !important;
        text-align: center;
    }
    #kmc-gif-query::-webkit-search-cancel-button,
    #kmc-gif-query::-moz-search-clear-button {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        cursor: pointer;
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 4l8 8M12 4l-8 8' stroke='%23fff' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E") center / contain no-repeat;
    }
    #kmc-panel #kmc-image-preview .kmc-remove {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 !important;
        line-height: 1 !important;
        border: 1px solid rgba(255,255,255,.35) !important;
        border-radius: 50% !important;
        background: rgba(20,20,22,.88) !important;
        color: #fff !important;
        font-size: 21px !important;
        font-weight: 400 !important;
    }
    #kmc-panel #kmc-image-preview .kmc-remove:hover {
        background: #53fc18 !important;
        color: #101010 !important;
    }
    #kmc-panel .kmc-edit-toolbar {
        display: flex;
        gap: 6px;
        margin-top: 7px;
    }
    #kmc-panel .kmc-edit-toolbar button {
        flex: 1;
        padding: 6px 4px;
        font-size: 12px !important;
    }
    #kmc-panel .kmc-restore-image {
        width: 100%;
        margin-top: 6px;
        padding: 6px;
        font-size: 12px !important;
    }
    #kmc-gif-results img {
        aspect-ratio: 1 / 1;
        border: 1px solid transparent;
        transition: transform .15s ease, border-color .15s ease;
    }
    #kmc-gif-results img:hover { transform: scale(1.03); border-color: #53fc18; }
    @media (prefers-reduced-motion: reduce) {
        #kmc-panel *, #kmc-gif-panel *, #kmc-button * { transition: none !important; }
    }
`;
document.head.appendChild(estilosKMC);

const painel = document.createElement("div");

painel.id = "kmc-panel";

Object.assign(painel.style, {
    position: "fixed",
    width: "300px",
    padding: "20px",
    background: "#18181b",
    borderRadius: "12px",
    zIndex: "999998",
    color: "#fff",
    display: "none",
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)"
});

painel.innerHTML = `
    <h3>🎞️ KICKShot <button id="kmc-close" type="button" aria-label="Fechar">×</button></h3>

        <button
        id="kmc-open-gifs"
        type="button"
        style="width:100%; padding:10px; margin-bottom:10px; cursor:pointer;"
    >
        🔎 Buscar GIFs
    </button>

    <button id="kmc-image"
        style="width:100%; padding:10px; margin-bottom:10px; cursor:pointer;">
        🖼️ Escolher imagem
    </button>

    <input
        id="kmc-file"
        type="file"
        accept="image/*"
        style="display:none;"
    >

    <div
        id="kmc-drop"
        style="
            box-sizing:border-box;
            width:100%;
            min-height:80px;
            margin-bottom:10px;
            padding:12px;
            border:2px dashed #555;
            border-radius:8px;
            display:flex;
            align-items:center;
            justify-content:center;
            text-align:center;
            line-height:1.4;
            color:#aaa;
            cursor:pointer;
        "
    >
        🖼️ Arraste uma imagem aqui
    </div>

    <div
        id="kmc-image-preview"
        style="
            display:none;
            margin-bottom:10px;
            text-align:center;
        "
    ></div>

    <input
        id="kmc-url"
        placeholder="Cole um link... ou Ctrl+V uma imagem"
        title="Para colar uma imagem, deixe este campo selecionado e use Ctrl+V."
        style="box-sizing:border-box; width:100%; padding:10px; margin-bottom:10px;"
    >

    <button
        id="kmc-copy-code"
        type="button"
        style="display:none; width:100%; padding:8px; margin-bottom:10px; cursor:pointer;"
    >
        📋 Copiar código
    </button>


    <button
        id="kmc-send"
        style="width:100%; padding:10px; cursor:pointer;"
    >
        📤 Enviar
    </button>
`;

document.body.appendChild(painel);

const gifPainel = document.createElement("div");

gifPainel.id = "kmc-gif-panel";

Object.assign(gifPainel.style, {
    position: "fixed",
    width: "300px",
    padding: "15px",
    background: "#18181b",
    borderRadius: "12px",
    zIndex: "999997",
    color: "#fff",
    display: "none",
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)"
});

gifPainel.innerHTML = `
    <h3>GIFs <button id="kmc-gif-close" type="button" aria-label="Fechar">×</button></h3>
    <p>Pesquise GIFs e selecione um para preparar o envio.</p>
`;

document.body.appendChild(gifPainel);
gifPainel.insertAdjacentHTML("beforeend", '<div style="display:flex; gap:8px; margin-bottom:10px;"><div style="position:relative; flex:1;"><input id="kmc-gif-query" type="text" maxlength="80" placeholder="O que você quer encontrar?" aria-label="Buscar GIFs" style="width:100%; padding:10px 34px 10px 10px;"><button id="kmc-gif-clear" type="button" aria-label="Limpar busca" style="display:none; position:absolute; right:6px; top:50%; transform:translateY(-50%); width:24px; height:24px; padding:0 !important; border:0 !important; border-radius:50% !important; background:transparent !important; color:#fff !important; font-size:18px !important; line-height:1; align-items:center; justify-content:center; cursor:pointer;">×</button></div><button id="kmc-gif-search" type="button" style="padding:8px 12px; cursor:pointer;">Buscar</button></div><p id="kmc-gif-status" role="status" aria-live="polite" style="min-height:20px; margin:0 0 10px; color:#c4c4cc; font-size:13px;"></p><div id="kmc-gif-results" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(100px,1fr)); gap:8px;"></div><p style="margin:12px 0 0; text-align:right; font-size:12px; color:#c4c4cc;">Powered by GIPHY</p>');

function fecharPainelAnimado(painelAlvo) {
    if (painelAlvo.style.display === "none") return;

    const animacoes = painelAlvo.getAnimations();
    animacoes.forEach(animacao => animacao.cancel());

    if (
        !painelAlvo.animate ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
        painelAlvo.style.display = "none";
        return;
    }

    const saida = painelAlvo.animate(
        [
            { opacity: 1, transform: "translateY(0) scale(1)" },
            { opacity: 0, transform: "translateY(10px) scale(.97)" }
        ],
        { duration: 240, easing: "cubic-bezier(.4,0,1,1)" }
    );
    saida.onfinish = () => {
        if (painelAlvo.getAnimations().includes(saida)) {
            painelAlvo.style.display = "none";
        }
    };
}

function abrirPainelAnimado(painelAlvo) {
    painelAlvo.getAnimations().forEach(animacao => animacao.cancel());
    painelAlvo.style.display = "block";
    painelAlvo.animate(
        [
            {
                opacity: 0,
                transform: "translateY(12px) scale(.97)"
            },
            {
                opacity: 1,
                transform: "translateY(-1px) scale(1.01)",
                offset: 0.72
            },
            {
                opacity: 1,
                transform: "translateY(0) scale(1)"
            }
        ],
        { duration: 560, easing: "cubic-bezier(.22,.61,.36,1)" }
    );
    painelAlvo.animate(
        [
            { outlineColor: "rgba(83,252,24,0)", outlineOffset: "0px" },
            { outlineColor: "rgba(83,252,24,.8)", outlineOffset: "2px", offset: 0.48 },
            { outlineColor: "rgba(83,252,24,.22)", outlineOffset: "1px" }
        ],
        { duration: 900, easing: "ease-out" }
    );

    const iconeBotao = botao.querySelector("svg");
    iconeBotao?.getAnimations().forEach(animacao => animacao.cancel());
    iconeBotao?.animate(
        [
            { transform: "rotate(-90deg) scale(.65)" },
            { transform: "rotate(24deg) scale(1.2)", offset: 0.62 },
            { transform: "rotate(0deg) scale(1)" }
        ],
        { duration: 560, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
}

let imagemSelecionada = null;
let imagemOriginalSelecionada = null;
let imagemFoiEditada = false;
let previewImagemUrl = null;
let enviandoMensagem = false;
let fazendoUpload = false;
let erroUltimoUploadImagem = "";

let linksOriginais = {};

try {
    linksOriginais =
        JSON.parse(
            localStorage.getItem(
                "kmc_links_originais"
            ) || "{}"
        );
} catch (erro) {
    linksOriginais = {};
}

function salvarLinkOriginal(tag, url) {
    if (!tag || !url) {
        return;
    }

    linksOriginais[tag] = url;

    try {
        localStorage.setItem(
            "kmc_links_originais",
            JSON.stringify(linksOriginais)
        );
    } catch (erro) {
        console.warn(
            "KickMediaChat - não conseguiu salvar link:",
            erro
        );
    }
}

function obterLinkOriginal(tag) {
    return linksOriginais[tag] || null;
}


// ========================================
// CÓDIGO DE IMAGEM
// ========================================

function codificarImagem(url) {
    try {
        const endereco = new URL(url);
        if (endereco.protocol !== "https:" || endereco.hostname !== "files.catbox.moe") return null;
        const nomeArquivo = decodeURIComponent(endereco.pathname.slice(1));
        if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]{1,10})?$/.test(nomeArquivo)) return null;
        // O sublinhado evita que a Kick trate o final .png/.gif como link.
        return nomeArquivo.replace(/\./g, "_");
    } catch (erro) {
        console.error("KickMediaChat: não foi possível encurtar o link da imagem:", erro);
        return null;
    }
}

function decodificarImagem(codigo) {
    if (typeof codigo !== "string") return null;

    // Códigos antigos de URL https começam com "aHR0cHM" em Base64URL.
    // Não tente decodificar os códigos curtos novos como Base64.
    if (/^aHR0cHM[A-Za-z0-9_-]*$/.test(codigo) && codigo.length % 4 !== 1) {
        try {
            let base64 = codigo.replace(/-/g, "+").replace(/_/g, "/");
            base64 += "=".repeat((4 - base64.length % 4) % 4);
            const binario = atob(base64);
            const bytes = Uint8Array.from(binario, caractere => caractere.charCodeAt(0));
            const urlAntiga = new TextDecoder().decode(bytes);
            if (/^https:\/\/files\.catbox\.moe\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]{1,10})?$/i.test(urlAntiga)) return urlAntiga;
        } catch (erro) {
            // O formato curto não é Base64; tenta reconhecê-lo abaixo.
        }
    }

    // Formato curto novo: KMCIMG_<id>_<extensão>, sem ponto/link.
    const curto = codigo.match(/^([A-Za-z0-9_-]+)_(gif|png|jpe?g|webp|avif|heic|mp4|webm|mov)$/i);
    if (curto) return "https://files.catbox.moe/" + curto[1] + "." + curto[2];

    return null;
}


// ========================================
// POSICIONAMENTO
// ========================================

function posicionarPainel() {
    const rect = botao.style.display === "none"
        ? null
        : botao.getBoundingClientRect();
    const viewport = window.visualViewport;
    const margem = 12;
    const esquerdaVisivel = viewport?.offsetLeft || 0;
    const topoVisivel = viewport?.offsetTop || 0;
    const larguraVisivel = viewport?.width || window.innerWidth;
    const alturaVisivel = viewport?.height || window.innerHeight;

    const limitarPosicao = (elemento, larguraBase, topoDesejado, larguraMaxima, alturaMaxima) => {
        const largura = Math.max(120, Math.min(larguraMaxima, larguraVisivel - margem * 2));
        const alturaDisponivel = Math.max(80, alturaVisivel - margem * 2);

        elemento.style.setProperty("width", `${largura}px`, "important");
        elemento.style.setProperty("max-height", `${alturaDisponivel}px`, "important");
        elemento.style.overflowY = "auto";

        if (elemento === gifPainel) {
            elemento.style.setProperty(
                "height",
                `${Math.min(alturaMaxima, alturaDisponivel)}px`,
                "important"
            );
            const areaGifs = document.getElementById("kmc-gif-scroll-area");
            if (areaGifs) {
                areaGifs.style.setProperty(
                    "height",
                    `${Math.max(80, Math.min(365, alturaDisponivel - 175))}px`,
                    "important"
                );
            }
        }

        const altura = elemento.getBoundingClientRect().height || alturaMaxima;
        const esquerdaDesejada = rect
            ? rect.left - (largura - larguraBase)
            : (parseFloat(elemento.style.left) || esquerdaVisivel + margem);
        const maxEsquerda = esquerdaVisivel + larguraVisivel - largura - margem;
        const maxTopo = topoVisivel + alturaVisivel - altura - margem;
        const esquerda = Math.max(esquerdaVisivel + margem, Math.min(esquerdaDesejada, maxEsquerda));
        const topoPreferido = rect
            ? topoDesejado
            : (parseFloat(elemento.style.top) || topoVisivel + margem);
        const topo = Math.max(topoVisivel + margem, Math.min(topoPreferido, maxTopo));

        elemento.style.left = `${esquerda}px`;
        elemento.style.top = `${topo}px`;
    };

    limitarPosicao(painel, 62, rect ? rect.top - 540 : 12, 320, 420);
    limitarPosicao(gifPainel, 2, rect ? rect.top - 520 : 12, 440, 540);
}

function posicionarBotao() {

    const engrenagens = [
        ...document.querySelectorAll(
            'svg[data-ds-icon="Settings"]'
        )
    ];

    if (!engrenagens.length) {
        botao.style.display = "none";
        return;
    }

    const botoes =
        engrenagens
            .map(svg => svg.closest("button"))
            .filter(Boolean)
            .filter(button => {

                const rect =
                    button.getBoundingClientRect();

                return (
                    rect.width > 0 &&
                    rect.height > 0 &&
                    rect.bottom > 0 &&
                    rect.top < window.innerHeight
                );
            });

    if (!botoes.length) {
        botao.style.display = "none";
        return;
    }

    const campos = [
        ...document.querySelectorAll(SELETOR_CAMPO_EDITAVEL)
    ].filter(elemento => {

        const rect =
            elemento.getBoundingClientRect();

        if (
            rect.width === 0 ||
            rect.height === 0
        ) {
            return false;
        }

        const texto = (
            elemento.getAttribute("placeholder") || ""
        ).toLowerCase();

        return (
            texto.includes("message") ||
            texto.includes("mensagem") ||
            texto.includes("chat") ||
            elemento.isContentEditable ||
            elemento.getAttribute("role") === "textbox"
        );
    });

    let botaoEngrenagem = null;
    let campoChat = null;

    if (campos.length) {

        campoChat =
            campos.sort((a, b) => {

                const ra =
                    a.getBoundingClientRect();

                const rb =
                    b.getBoundingClientRect();

                const distanciaA =
                    Math.abs(
                        window.innerWidth - ra.right
                    ) +
                    Math.abs(
                        window.innerHeight - ra.bottom
                    );

                const distanciaB =
                    Math.abs(
                        window.innerWidth - rb.right
                    ) +
                    Math.abs(
                        window.innerHeight - rb.bottom
                    );

                return distanciaA - distanciaB;

            })[0];

        const campoRect =
            campoChat.getBoundingClientRect();

        botaoEngrenagem =
            botoes.sort((a, b) => {

                const ra =
                    a.getBoundingClientRect();

                const rb =
                    b.getBoundingClientRect();

                const distanciaA =
                    Math.abs(
                        ra.left - campoRect.right
                    ) +
                    Math.abs(
                        ra.top - campoRect.top
                    );

                const distanciaB =
                    Math.abs(
                        rb.left - campoRect.right
                    ) +
                    Math.abs(
                        rb.top - campoRect.top
                    );

                return distanciaA - distanciaB;

            })[0];

    } else {

        botaoEngrenagem =
            botoes.sort((a, b) => {

                return (
                    b.getBoundingClientRect().top -
                    a.getBoundingClientRect().top
                );

            })[0];
    }

    if (!botaoEngrenagem) {
        botao.style.display = "none";
        return;
    }

    const rect =
        botaoEngrenagem.getBoundingClientRect();

    botao.style.left =
        (rect.left - 42) + "px";

    botao.style.top =
        (rect.top + rect.height / 2 - 17) + "px";

    botao.style.right = "auto";

    botao.style.display = "flex";

    if (
        painel.style.display === "none" &&
        gifPainel.style.display === "none"
    ) {
        posicionarPainel();
    }
}


// ========================================
// PÁGINA
// ========================================

function verificarPagina() {

    const caminho =
        window.location.pathname;

    const paginaDeCanal =
        caminho !== "/" &&
        !caminho.startsWith("/categories") &&
        !caminho.startsWith("/search") &&
        !caminho.startsWith("/browse") &&
        !caminho.startsWith("/directory") &&
        !caminho.startsWith("/video");

    if (!paginaDeCanal) {

        botao.style.display = "none";
        painel.style.display = "none";
        gifPainel.style.display = "none";

        return;
    }

    posicionarBotao();
}


// ========================================
// BOTÃO
// ========================================

botao.addEventListener(
    "click",
    evento => {

        evento.stopPropagation();

        if (
            painel.style.display === "none"
        ) {

            gifPainel.style.display =
                "none";

            abrirPainelAnimado(painel);

            posicionarPainel();

        } else {

            fecharPainelAnimado(painel);
            fecharPainelAnimado(gifPainel);
        }
    }
);

painel.addEventListener(
    "click",
    evento => {
        evento.stopPropagation();
    }
);

painel.addEventListener("paste", evento => {
    const areaTransferencia = evento.clipboardData;
    if (!areaTransferencia) return;

    const itemImagem = Array.from(areaTransferencia.items || []).find(
        item => item.kind === "file" && item.type.startsWith("image/")
    );
    const arquivoImagem =
        itemImagem?.getAsFile() ||
        Array.from(areaTransferencia.files || []).find(
            arquivo => arquivo.type.startsWith("image/")
        );

    if (!arquivoImagem) return;

    evento.preventDefault();
    evento.stopPropagation();
    selecionarImagem(arquivoImagem);
}, true);

document.getElementById("kmc-close").addEventListener("click", evento => {
    evento.stopPropagation();
    fecharPainelAnimado(painel);
});

gifPainel.addEventListener(
    "click",
    evento => {
        evento.stopPropagation();
    }
);

document.getElementById("kmc-gif-close").addEventListener("click", evento => {
    evento.stopPropagation();
    fecharPainelAnimado(gifPainel);
});

const campoBuscaGifsKMC = document.getElementById("kmc-gif-query");
const resultadosGifsKMC = document.getElementById("kmc-gif-results");
const statusBuscaGifsKMC = document.getElementById("kmc-gif-status");
const botaoBuscarGifsKMC = document.getElementById("kmc-gif-search");
const botaoLimparBuscaGifsKMC = document.getElementById("kmc-gif-clear");
campoBuscaGifsKMC.addEventListener("input", () => {
    botaoLimparBuscaGifsKMC.style.display = campoBuscaGifsKMC.value ? "flex" : "none";
});
botaoLimparBuscaGifsKMC.addEventListener("click", evento => {
    evento.stopPropagation();
    campoBuscaGifsKMC.value = "";
    campoBuscaGifsKMC.dispatchEvent(new Event("input", { bubbles: true }));
    resultadosGifsKMC.replaceChildren();
    statusBuscaGifsKMC.textContent = "";
    campoBuscaGifsKMC.focus();
});

function solicitarGifsKMC(consulta) {
    const runtime = (typeof chrome !== "undefined" ? chrome.runtime : null);
    if (!runtime || typeof runtime.sendMessage !== "function") {
        return Promise.reject(new Error("Recarregue a extensão e a página da Kick."));
    }

    return new Promise((resolve, reject) => {
        runtime.sendMessage({ tipo: "KMC_BUSCAR_GIFS", consulta }, resposta => {
            const erro = runtime.lastError;
            if (erro) return reject(new Error("Falha ao acessar a busca de GIFs."));
            if (!resposta || !resposta.sucesso) {
                return reject(new Error(resposta && resposta.erro || "Não foi possível buscar GIFs."));
            }
            resolve(Array.isArray(resposta.gifs) ? resposta.gifs : []);
        });
    });
}

async function buscarGifsKMC() {
    const consulta = campoBuscaGifsKMC.value.trim();
    resultadosGifsKMC.replaceChildren();
    if (!consulta) {
        statusBuscaGifsKMC.textContent = "Digite algo para buscar.";
        campoBuscaGifsKMC.focus();
        return;
    }

    botaoBuscarGifsKMC.disabled = true;
    statusBuscaGifsKMC.textContent = "Buscando GIFs…";
    try {
        const gifs = await solicitarGifsKMC(consulta);
        if (!gifs.length) {
            statusBuscaGifsKMC.textContent = "Nenhum GIF encontrado.";
            return;
        }

        statusBuscaGifsKMC.textContent = "Clique em um GIF para preparar o envio.";
        for (const gif of gifs) {
            if (!gif || typeof gif.url !== "string" || !/^https:\/\/media[0-9]*\.giphy\.com\//i.test(gif.url)) continue;
            const escolha = document.createElement("button");
            escolha.type = "button";
            escolha.title = gif.title || "Selecionar GIF";
            escolha.setAttribute("aria-label", gif.title || "Selecionar GIF");
            escolha.style.cssText = "padding:4px; cursor:pointer; min-height:100px;";

            const imagem = document.createElement("img");
            imagem.src = gif.preview || gif.url;
            imagem.alt = gif.title || "GIF do GIPHY";
            imagem.loading = "lazy";
            imagem.style.cssText = "display:block; width:100%; height:100px; object-fit:cover; border-radius:5px;";
            escolha.appendChild(imagem);
            escolha.addEventListener("click", evento => {
                evento.stopPropagation();
                const campoUrl = document.getElementById("kmc-url");
                campoUrl.value = gif.url;
                campoUrl.dispatchEvent(new Event("input", { bubbles: true }));
                fecharPainelAnimado(gifPainel);
                abrirPainelAnimado(painel);
                posicionarPainel();
            });
            resultadosGifsKMC.appendChild(escolha);
        }
    } catch (erro) {
        statusBuscaGifsKMC.textContent = erro.message || "Erro ao buscar GIFs.";
    } finally {
        botaoBuscarGifsKMC.disabled = false;
    }
}

document.getElementById("kmc-open-gifs").addEventListener("click", evento => {
    evento.stopPropagation();
    fecharPainelAnimado(painel);
    abrirPainelAnimado(gifPainel);
    posicionarPainel();
    campoBuscaGifsKMC.focus();
});

botaoBuscarGifsKMC.addEventListener("click", evento => {
    evento.stopPropagation();
    buscarGifsKMC();
});

campoBuscaGifsKMC.addEventListener("keydown", evento => {
    if (evento.key === "Enter") {
        evento.preventDefault();
        buscarGifsKMC();
    }
});

document.addEventListener(
    "click",
    () => {

        if (enviandoMensagem) {
            return;
        }

        fecharPainelAnimado(painel);
        fecharPainelAnimado(gifPainel);
    }
);


// ========================================
// CONVERSÃO DE LINKS
// ========================================

function converterEnderecoParaTag(valor) {

    if (!valor) {
        return null;
    }

    valor =
        valor.trim();

    if (
        /^gph:[A-Za-z0-9_.-]+$/i.test(valor)
    ) {
        return valor;
    }

    if (
        /^tnr:[A-Za-z0-9_.-]+$/i.test(valor)
    ) {
        return valor;
    }

    if (
        /^KMCGIF_TNR_[A-Za-z0-9_.-]+$/i.test(valor)
    ) {
        return valor;
    }

    if (
        /^KMCIMG_[A-Za-z0-9_.-]+$/i.test(valor)
    ) {
        return valor;
    }

    if (
        /^img:https%3A/i.test(valor)
    ) {
        return valor;
    }

    let resultado =
        valor.match(
            /giphy\.com\/media\/([A-Za-z0-9_-]+)(?:[/?#]|$)/i
        );

    if (resultado) {

        const id =
            resultado[1];

        const tag =
            "gph:" + id;

        salvarLinkOriginal(
            tag,
            valor
        );

        return tag;
    }

    resultado =
        valor.match(
            /giphy\.com\/gifs\/[^/?#]+-([A-Za-z0-9_-]+)(?:[/?#]|$)/i
        );

    if (resultado) {

        const id =
            resultado[1];

        const tag =
            "gph:" + id;

        salvarLinkOriginal(
            tag,
            valor
        );

        return tag;
    }

    resultado =
        valor.match(
            /(?:https?:\/\/)?(?:media|i)\.giphy\.com\/(?:media\/)?([A-Za-z0-9_-]+)(?:\/|$)/i
        );

    if (resultado) {

        const id =
            resultado[1];

        const tag =
            "gph:" + id;

        salvarLinkOriginal(
            tag,
            valor
        );

        return tag;
    }

    resultado =
        valor.match(
            /giphy\.com\/media\/v1\.[^/?#]+\/([A-Za-z0-9_-]+)(?:\/|$)/i
        );

    if (resultado) {

        const id =
            resultado[1];

        const tag =
            "gph:" + id;

        salvarLinkOriginal(
            tag,
            valor
        );

        return tag;
    }

    resultado =
        valor.match(
            /(?:https?:\/\/)?media\.tenor\.com\/([A-Za-z0-9_-]+)(?:\/|$)/i
        );

    if (resultado) {

        const id =
            resultado[1];

        const tag =
            "tnr:" + id;

        salvarLinkOriginal(
            tag,
            valor
        );

        return tag;
    }

    resultado =
        valor.match(
            /(?:https?:\/\/)?media1\.tenor\.com\/m\/([A-Za-z0-9_-]+)(?:\/|$)/i
        );

    if (resultado) {

        const id =
            resultado[1];

        const tag =
            "tnr:" + id;

        salvarLinkOriginal(
            tag,
            valor
        );

        return tag;
    }

    resultado =
        valor.match(
            /(?:https?:\/\/)?media1\.tenor\.com\/([A-Za-z0-9_-]+)(?:\/|$)/i
        );

    if (resultado) {

        const id =
            resultado[1];

        const tag =
            "tnr:" + id;

        salvarLinkOriginal(
            tag,
            valor
        );

        return tag;
    }

    resultado =
        valor.match(
            /tenor\.com\/view\/[^/?#]+-([A-Za-z0-9_-]+)(?:[/?#]|$)/i
        );

    if (resultado) {

        const tag =
            "tnr:" + resultado[1];

        salvarLinkOriginal(
            tag,
            valor
        );

        return tag;
    }

    // Links diretos do Catbox podem ser preparados como imagem/vídeo também.
    try {
        const endereco = new URL(valor);
        const extensao = endereco.pathname.match(/\.(gif|png|jpe?g|webp|avif|mp4|webm|mov)$/i);
        if (
            endereco.protocol === "https:" &&
            endereco.hostname.toLowerCase() === "files.catbox.moe" &&
            extensao
        ) {
            return "img:" + encodeURIComponent(endereco.href);
        }
    } catch (erro) {
        // A entrada ainda pode estar incompleta enquanto a pessoa digita.
    }

    return null;
}


// ========================================
// IMAGEM
// ========================================

function limparPreviewImagem() {
    if (previewImagemUrl) {
        URL.revokeObjectURL(previewImagemUrl);
        previewImagemUrl = null;
    }

    const preview = document.getElementById("kmc-image-preview");
    if (preview) {
        preview.replaceChildren();
        preview.style.display = "none";
    }
}

function limparImagemOriginalSelecionada() {
    imagemOriginalSelecionada = null;
    imagemFoiEditada = false;
}

function mostrarPreviewImagem(file) {
    if (!file || !file.type || !file.type.startsWith("image/")) {
        alert("Escolha um arquivo de imagem.");
        return false;
    }

    limparPreviewImagem();
    imagemSelecionada = file;

    const preview = document.getElementById("kmc-image-preview");
    const moldura = document.createElement("div");
    moldura.style.position = "relative";
    moldura.style.display = "inline-block";
    moldura.style.maxWidth = "100%";

    const img = document.createElement("img");
    previewImagemUrl = URL.createObjectURL(file);
    img.src = previewImagemUrl;
    img.style.maxWidth = "180px";
    img.style.maxHeight = "120px";
    img.style.borderRadius = "8px";
    img.style.display = "block";

    const remover = document.createElement("button");
    remover.className = "kmc-remove";
    remover.type = "button";
    remover.title = "Remover imagem selecionada";
    remover.setAttribute("aria-label", "Remover imagem selecionada");
    Object.assign(remover.style, {
        position: "absolute",
        top: "5px",
        right: "5px",
        width: "28px",
        height: "28px",
        padding: "0",
        border: "1px solid rgba(255,255,255,.35)",
        borderRadius: "50%",
        background: "rgba(20,20,22,.88)",
        color: "#fff",
        fontSize: "21px",
        lineHeight: "1",
        cursor: "pointer",
        zIndex: "1"
    });

    const iconeX = document.createElement("span");
    Object.assign(iconeX.style, {
        position: "absolute",
        inset: "0",
        pointerEvents: "none"
    });
    for (const angulo of [45, -45]) {
        const linha = document.createElement("span");
        Object.assign(linha.style, {
            position: "absolute",
            left: "50%",
            top: "50%",
            width: "12px",
            height: "2px",
            borderRadius: "2px",
            background: "#fff",
            transform: `translate(-50%, -50%) rotate(${angulo}deg)`
        });
        iconeX.appendChild(linha);
    }
    remover.appendChild(iconeX);

    remover.addEventListener("click", evento => {
        evento.preventDefault();
        evento.stopPropagation();
        imagemSelecionada = null;
        limparImagemOriginalSelecionada();
        document.getElementById("kmc-file").value = "";
        limparPreviewImagem();
    });

    const camadaCorte = document.createElement("div");
    Object.assign(camadaCorte.style, {
        position: "absolute",
        inset: "0",
        display: "none",
        overflow: "hidden",
        cursor: "crosshair",
        touchAction: "none",
        zIndex: "1"
    });

    const caixaCorte = document.createElement("div");
    Object.assign(caixaCorte.style, {
        position: "absolute",
        border: "2px solid #53fc18",
        background: "rgba(83,252,24,.16)",
        boxSizing: "border-box",
        boxShadow: "0 0 0 9999px rgba(0,0,0,.48)",
        pointerEvents: "auto",
        cursor: "move"
    });

    for (const [nome, topo, esquerda, cursor] of [
        ["nw", "0", "0", "nwse-resize"],
        ["ne", "0", "100%", "nesw-resize"],
        ["sw", "100%", "0", "nesw-resize"],
        ["se", "100%", "100%", "nwse-resize"]
    ]) {
        const alca = document.createElement("div");
        alca.dataset.canto = nome;
        Object.assign(alca.style, {
            position: "absolute",
            top: topo,
            left: esquerda,
            width: "12px",
            height: "12px",
            transform: "translate(-50%, -50%)",
            border: "2px solid #53fc18",
            borderRadius: "2px",
            boxSizing: "border-box",
            background: "#fff",
            cursor,
            pointerEvents: "auto"
        });
        caixaCorte.appendChild(alca);
    }
    camadaCorte.appendChild(caixaCorte);

    remover.style.zIndex = "2";
    moldura.append(img, camadaCorte, remover);

    const barraEdicao = document.createElement("div");
    barraEdicao.className = "kmc-edit-toolbar";

    const criarBotaoEdicao = (rotulo, dica) => {
        const botaoEdicao = document.createElement("button");
        botaoEdicao.type = "button";
        botaoEdicao.textContent = rotulo;
        botaoEdicao.title = dica;
        botaoEdicao.addEventListener("click", evento => {
            evento.preventDefault();
            evento.stopPropagation();
        });
        return botaoEdicao;
    };

    const podeEditar = ["image/png", "image/jpeg", "image/webp", "image/avif", "image/bmp"].includes(file.type);
    const girarEsquerda = criarBotaoEdicao("↶ 90°", "Girar para a esquerda");
    const girarDireita = criarBotaoEdicao("↷ 90°", "Girar para a direita");
    const botaoCorte = criarBotaoEdicao("✂ Cortar", "Selecionar uma área para cortar");
    const aplicarCorte = criarBotaoEdicao("Aplicar", "Aplicar o corte selecionado");
    const voltarOriginal = criarBotaoEdicao("↩ Voltar ao original", "Desfazer cortes e giros");
    voltarOriginal.className = "kmc-restore-image";
    voltarOriginal.textContent = "↩ Voltar ao original";
    voltarOriginal.style.display = imagemFoiEditada ? "block" : "none";
    aplicarCorte.disabled = true;

    for (const botaoEdicao of [girarEsquerda, girarDireita, botaoCorte, aplicarCorte]) {
        botaoEdicao.disabled = !podeEditar;
    }

    const orientacaoCorte = document.createElement("div");
    orientacaoCorte.textContent = podeEditar
        ? "Gire a imagem ou selecione uma área para cortar."
        : (file.type === "image/gif" ? "GIFs animados não podem ser editados sem perder a animação." : "Use PNG, JPG, WebP, AVIF ou BMP para cortar e girar.");
    Object.assign(orientacaoCorte.style, {
        marginTop: "5px",
        color: "#aaa",
        fontSize: "11px",
        lineHeight: "1.35"
    });

    barraEdicao.append(girarEsquerda, girarDireita, botaoCorte, aplicarCorte);
    preview.append(moldura, barraEdicao, voltarOriginal, orientacaoCorte);

    voltarOriginal.addEventListener("click", () => {
        if (!imagemOriginalSelecionada) return;
        imagemFoiEditada = false;
        mostrarPreviewImagem(imagemOriginalSelecionada);
    });

    girarEsquerda.addEventListener("click", async () => {
        const editada = await transformarImagemSelecionada(-90);
        if (editada) {
            imagemFoiEditada = true;
            mostrarPreviewImagem(editada);
        }
    });

    girarDireita.addEventListener("click", async () => {
        const editada = await transformarImagemSelecionada(90);
        if (editada) {
            imagemFoiEditada = true;
            mostrarPreviewImagem(editada);
        }
    });

    let pontoInicial = null;
    let recorteSelecionado = null;
    let modoArraste = "novo";
    let cantoAtivo = null;
    let retanguloInicial = null;
    const atualizarCaixaCorte = (x1, y1, x2, y2) => {
        caixaCorte.style.left = `${Math.min(x1, x2)}px`;
        caixaCorte.style.top = `${Math.min(y1, y2)}px`;
        caixaCorte.style.width = `${Math.abs(x2 - x1)}px`;
        caixaCorte.style.height = `${Math.abs(y2 - y1)}px`;
    };
    const lerRetanguloCorte = () => ({
        x: parseFloat(caixaCorte.style.left) || 0,
        y: parseFloat(caixaCorte.style.top) || 0,
        largura: parseFloat(caixaCorte.style.width) || 0,
        altura: parseFloat(caixaCorte.style.height) || 0
    });

    botaoCorte.addEventListener("click", () => {
        const iniciando = camadaCorte.style.display === "none";
        img.style.maxWidth = iniciando ? "280px" : "180px";
        img.style.maxHeight = iniciando ? "280px" : "120px";
        camadaCorte.style.display = iniciando ? "block" : "none";
        botaoCorte.textContent = iniciando ? "Cancelar" : "✂ Cortar";
        orientacaoCorte.textContent = iniciando
            ? "Arraste para marcar; ajuste pelos quadrados ou arraste dentro para mover."
            : "Gire a imagem ou selecione uma área para cortar.";
        aplicarCorte.disabled = true;
        recorteSelecionado = null;
        modoArraste = "novo";
        cantoAtivo = null;
        retanguloInicial = null;
        caixaCorte.style.left = "0px";
        caixaCorte.style.top = "0px";
        caixaCorte.style.width = "0";
        caixaCorte.style.height = "0";
        requestAnimationFrame(() => {
            if (painel.style.display !== "none") posicionarPainel();
        });
    });

    const pontoNaImagem = evento => {
        const limites = img.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(limites.width, evento.clientX - limites.left)),
            y: Math.max(0, Math.min(limites.height, evento.clientY - limites.top)),
            largura: limites.width,
            altura: limites.height
        };
    };

    camadaCorte.addEventListener("pointerdown", evento => {
        evento.preventDefault();
        evento.stopPropagation();
        pontoInicial = pontoNaImagem(evento);
        const alca = evento.target.closest?.("[data-canto]");

        if (alca && recorteSelecionado) {
            modoArraste = "redimensionar";
            cantoAtivo = alca.dataset.canto;
            retanguloInicial = lerRetanguloCorte();
        } else if (evento.target === caixaCorte && recorteSelecionado) {
            modoArraste = "mover";
            retanguloInicial = lerRetanguloCorte();
        } else {
            modoArraste = "novo";
            cantoAtivo = null;
            retanguloInicial = null;
            recorteSelecionado = null;
            aplicarCorte.disabled = true;
            atualizarCaixaCorte(pontoInicial.x, pontoInicial.y, pontoInicial.x, pontoInicial.y);
        }
        camadaCorte.setPointerCapture(evento.pointerId);
    });

    camadaCorte.addEventListener("pointermove", evento => {
        if (!pontoInicial) return;
        const ponto = pontoNaImagem(evento);

        if (modoArraste === "novo") {
            atualizarCaixaCorte(pontoInicial.x, pontoInicial.y, ponto.x, ponto.y);
            return;
        }
        if (!retanguloInicial) return;

        if (modoArraste === "mover") {
            const x = Math.max(0, Math.min(
                ponto.largura - retanguloInicial.largura,
                retanguloInicial.x + ponto.x - pontoInicial.x
            ));
            const y = Math.max(0, Math.min(
                ponto.altura - retanguloInicial.altura,
                retanguloInicial.y + ponto.y - pontoInicial.y
            ));
            atualizarCaixaCorte(x, y, x + retanguloInicial.largura, y + retanguloInicial.altura);
            return;
        }

        let { x, y, largura, altura } = retanguloInicial;
        let direita = x + largura;
        let baixo = y + altura;
        const minimo = 12;
        if (cantoAtivo.includes("w")) x = Math.max(0, Math.min(direita - minimo, ponto.x));
        if (cantoAtivo.includes("e")) direita = Math.min(ponto.largura, Math.max(x + minimo, ponto.x));
        if (cantoAtivo.includes("n")) y = Math.max(0, Math.min(baixo - minimo, ponto.y));
        if (cantoAtivo.includes("s")) baixo = Math.min(ponto.altura, Math.max(y + minimo, ponto.y));
        atualizarCaixaCorte(x, y, direita, baixo);
    });

    camadaCorte.addEventListener("pointerup", evento => {
        if (!pontoInicial) return;
        const ponto = pontoNaImagem(evento);
        if (modoArraste === "novo") {
            atualizarCaixaCorte(pontoInicial.x, pontoInicial.y, ponto.x, ponto.y);
        }
        const retangulo = lerRetanguloCorte();
        if (retangulo.largura >= 12 && retangulo.altura >= 12 && ponto.largura && ponto.altura) {
            recorteSelecionado = {
                x: retangulo.x / ponto.largura,
                y: retangulo.y / ponto.altura,
                largura: retangulo.largura / ponto.largura,
                altura: retangulo.altura / ponto.altura
            };
            aplicarCorte.disabled = false;
        }
        pontoInicial = null;
        cantoAtivo = null;
        retanguloInicial = null;
    });

    camadaCorte.addEventListener("pointercancel", () => {
        pontoInicial = null;
        cantoAtivo = null;
        retanguloInicial = null;
    });

    aplicarCorte.addEventListener("click", async () => {
        if (!recorteSelecionado) return;
        const editada = await transformarImagemSelecionada(0, recorteSelecionado);
        if (editada) {
            imagemFoiEditada = true;
            mostrarPreviewImagem(editada);
        }
    });

    preview.style.display = "block";
    if (painel.style.display !== "none") posicionarPainel();
    document.getElementById("kmc-url").value = "";
    document.getElementById("kmc-copy-code").style.display = "none";
    return true;
}

async function transformarImagemSelecionada(rotacao, recorte = null) {
    const arquivoOriginal = imagemSelecionada;
    if (!arquivoOriginal || !["image/png", "image/jpeg", "image/webp", "image/avif", "image/bmp"].includes(arquivoOriginal.type)) {
        return null;
    }

    try {
        const urlTemporaria = URL.createObjectURL(arquivoOriginal);
        let imagem;
        try {
            imagem = new Image();
            imagem.src = urlTemporaria;
            await imagem.decode();
        } finally {
            URL.revokeObjectURL(urlTemporaria);
        }

        const canvas = document.createElement("canvas");
        const contexto = canvas.getContext("2d");
        if (!contexto) throw new Error("Canvas indisponível");

        if (recorte) {
            const origemX = Math.round(recorte.x * imagem.naturalWidth);
            const origemY = Math.round(recorte.y * imagem.naturalHeight);
            const largura = Math.max(1, Math.round(recorte.largura * imagem.naturalWidth));
            const altura = Math.max(1, Math.round(recorte.altura * imagem.naturalHeight));
            canvas.width = Math.min(largura, imagem.naturalWidth - origemX);
            canvas.height = Math.min(altura, imagem.naturalHeight - origemY);
            contexto.drawImage(
                imagem,
                origemX,
                origemY,
                canvas.width,
                canvas.height,
                0,
                0,
                canvas.width,
                canvas.height
            );
        } else {
            const trocaLados = Math.abs(rotacao) === 90;
            canvas.width = trocaLados ? imagem.naturalHeight : imagem.naturalWidth;
            canvas.height = trocaLados ? imagem.naturalWidth : imagem.naturalHeight;
            contexto.translate(canvas.width / 2, canvas.height / 2);
            contexto.rotate((rotacao * Math.PI) / 180);
            contexto.drawImage(
                imagem,
                -imagem.naturalWidth / 2,
                -imagem.naturalHeight / 2
            );
        }

        const tipoSaida = arquivoOriginal.type === "image/jpeg" ? "image/jpeg" : "image/png";
        const blob = await new Promise(resolve =>
            canvas.toBlob(resolve, tipoSaida, tipoSaida === "image/jpeg" ? 0.92 : undefined)
        );
        if (!blob) throw new Error("Não foi possível gerar a imagem editada");
        const extensao = tipoSaida === "image/jpeg" ? "jpg" : "png";
        return new File([blob], `kickmedia-editada-${Date.now()}.${extensao}`, {
            type: tipoSaida,
            lastModified: Date.now()
        });
    } catch (erro) {
        console.error("KickMediaChat - erro ao editar imagem:", erro);
        alert("Não foi possível editar essa imagem.");
        return null;
    }
}

function selecionarImagem(file) {

    if (fazendoUpload) {
        return;
    }

    imagemOriginalSelecionada = file;
    imagemFoiEditada = false;
    mostrarPreviewImagem(file);
}

document.getElementById(
    "kmc-image"
).addEventListener(
    "click",
    evento => {

        evento.stopPropagation();

        document.getElementById(
            "kmc-file"
        ).click();
    }
);

document.getElementById(
    "kmc-file"
).addEventListener(
    "change",
    evento => {

        const file =
            evento.target.files[0];

        if (file) {
            selecionarImagem(file);
        }
        evento.target.value = "";
    }
);

function atualizarLinkColado() {
    const campo = document.getElementById("kmc-url");
    const botaoCopiar = document.getElementById("kmc-copy-code");
    const valor = campo.value.trim();

    imagemSelecionada = null;
    limparImagemOriginalSelecionada();
    document.getElementById("kmc-file").value = "";
    limparPreviewImagem();

    if (!valor) {
        botaoCopiar.style.display = "none";
        return;
    }

    const tag = converterEnderecoParaTag(valor);
    if (!tag) {
        botaoCopiar.style.display = "none";
        return;
    }

    campo.value = tag;
    botaoCopiar.style.display = "block";

    let media = null;
    if (/^gph:/i.test(tag)) {
        media = criarImagemGiphy(tag.slice(4));
    } else if (/^tnr:/i.test(tag)) {
        media = criarImagemTenor(tag.slice(4));
    } else if (/^KMCGIF_TNR_/i.test(tag)) {
        media = criarImagemTenor(tag.replace(/^KMCGIF_TNR_/i, ""));
    } else if (/^KMCIMG_/i.test(tag)) {
        const url = decodificarImagem(tag.replace(/^KMCIMG_/i, ""));
        if (url) media = criarImagemEnviada(url);
    } else if (/^img:https%3A/i.test(tag)) {
        try {
            const url = decodeURIComponent(tag.slice(4));
            if (/^https:\/\/files\.catbox\.moe\//i.test(url)) {
                media = criarImagemEnviada(url);
            }
        } catch (erro) {
            media = null;
        }
    }

    if (!media) return;

    media.style.maxWidth = "180px";
    media.style.maxHeight = "120px";
    media.style.borderRadius = "8px";
    media.style.display = "block";

    const preview = document.getElementById("kmc-image-preview");
    preview.replaceChildren(media);
    preview.style.display = "block";
}

document.getElementById("kmc-url").addEventListener("input", atualizarLinkColado);

document.getElementById("kmc-copy-code").addEventListener("click", async evento => {
    evento.preventDefault();
    evento.stopPropagation();

    const campo = document.getElementById("kmc-url");
    const botao = evento.currentTarget;
    const codigo = campo.value.trim();
    if (!codigo || !converterEnderecoParaTag(codigo)) return;

    let copiado = false;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(codigo);
            copiado = true;
        }
    } catch (erro) {
        // Tenta o método compatível com navegadores que bloqueiam Clipboard API.
    }

    if (!copiado) {
        const auxiliar = document.createElement("textarea");
        auxiliar.value = codigo;
        auxiliar.style.position = "fixed";
        auxiliar.style.opacity = "0";
        document.body.appendChild(auxiliar);
        auxiliar.select();
        try {
            copiado = document.execCommand("copy");
        } catch (erro) {
            copiado = false;
        }
        auxiliar.remove();
    }

    botao.textContent = copiado ? "✅ Código copiado!" : "Não foi possível copiar";
    setTimeout(() => { botao.textContent = "📋 Copiar código"; }, 1500);
});

const areaDrop =
    document.getElementById(
        "kmc-drop"
    );

areaDrop.addEventListener(
    "click",
    evento => {

        evento.stopPropagation();

        document.getElementById(
            "kmc-file"
        ).click();
    }
);

areaDrop.addEventListener(
    "dragenter",
    evento => {

        evento.preventDefault();
        evento.stopPropagation();

        areaDrop.style.borderColor =
            "#53fc18";

        areaDrop.style.color =
            "#53fc18";
    }
);

areaDrop.addEventListener(
    "dragover",
    evento => {

        evento.preventDefault();
        evento.stopPropagation();

        areaDrop.style.borderColor =
            "#53fc18";

        areaDrop.style.color =
            "#53fc18";
    }
);

areaDrop.addEventListener(
    "dragleave",
    evento => {

        evento.preventDefault();
        evento.stopPropagation();

        areaDrop.style.borderColor =
            "#555";

        areaDrop.style.color =
            "#aaa";
    }
);

areaDrop.addEventListener(
    "drop",
    evento => {

        evento.preventDefault();
        evento.stopPropagation();

        areaDrop.style.borderColor =
            "#555";

        areaDrop.style.color =
            "#aaa";

        const arquivos =
            evento.dataTransfer.files;

        if (
            arquivos &&
            arquivos.length
        ) {

            selecionarImagem(
                arquivos[0]
            );
        }
    }
);


// ========================================
// UPLOAD PELO BACKGROUND
// ========================================

async function enviarImagemParaBackground(file) {
    erroUltimoUploadImagem = "";
    if (!file || !file.type || !file.type.startsWith("image/")) {
        erroUltimoUploadImagem = "O arquivo precisa ser uma imagem válida.";
        alert("O arquivo precisa ser uma imagem.");
        return null;
    }

    // O content.js precisa estar carregado pela extensão para acessar chrome.runtime.
    const runtime = (typeof chrome !== "undefined" ? chrome.runtime : null);
    if (!runtime || typeof runtime.sendMessage !== "function") {
        erroUltimoUploadImagem = "A extensão não conseguiu iniciar o envio. Recarregue-a e atualize a página.";
        console.error("KickMediaChat: chrome.runtime indisponível. Recarregue a extensão e confirme que content.js está declarado no manifest.json.");
        alert("A extensão não conseguiu se comunicar com o processo de envio. Recarregue a extensão e a página.");
        return null;
    }

    let dadosBase64;
    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binario = "";
        const tamanhoBloco = 0x8000;
        for (let inicio = 0; inicio < bytes.length; inicio += tamanhoBloco) {
            binario += String.fromCharCode(...bytes.subarray(inicio, inicio + tamanhoBloco));
        }
        dadosBase64 = btoa(binario);
    } catch (erro) {
        erroUltimoUploadImagem = "Não foi possível preparar a imagem.";
        console.error("KickMediaChat: não foi possível preparar a imagem:", erro);
        return null;
    }

    return new Promise(resolve => {
        try {
            runtime.sendMessage(
                {
                    tipo: "KMC_UPLOAD_IMAGEM",
                    dadosBase64,
                    mime: file.type || "application/octet-stream",
                    nome: file.name || "imagem.png"
                },
                resposta => {
                    const erro = runtime.lastError;
                    if (erro) {
                        erroUltimoUploadImagem = erro.message || "Falha de comunicação com a extensão.";
                        console.error("KickMediaChat: erro de comunicação:", erro.message);
                        resolve(null);
                        return;
                    }

                    if (!resposta || !resposta.sucesso || !resposta.url) {
                        erroUltimoUploadImagem = resposta && resposta.erro
                            ? resposta.erro
                            : "O serviço de hospedagem não retornou um link.";
                        console.error("KickMediaChat: erro ao enviar imagem:", resposta && resposta.erro ? resposta.erro : "Sem resposta válida.");
                        resolve(null);
                        return;
                    }

                    resolve(resposta.url);
                }
            );
        } catch (erro) {
            erroUltimoUploadImagem = erro && erro.message
                ? erro.message
                : "Falha de comunicação com o serviço de hospedagem.";
            console.error("KickMediaChat: falha ao chamar o processo de envio:", erro);
            resolve(null);
        }
    });
}


// ========================================
// CAMPO DO CHAT
// ========================================

function encontrarCampoChat() {

    const campos = [
        ...document.querySelectorAll(SELETOR_CAMPO_EDITAVEL)
    ].filter(elemento => {

        const rect =
            elemento.getBoundingClientRect();

        if (
            rect.width === 0 ||
            rect.height === 0
        ) {
            return false;
        }

        const texto = (
            elemento.getAttribute(
                "placeholder"
            ) || ""
        ).toLowerCase();

        return (
            texto.includes("message") ||
            texto.includes("mensagem") ||
            texto.includes("chat") ||
            elemento.isContentEditable ||
            elemento.getAttribute("role") === "textbox"
        );
    });

    if (!campos.length) {
        return null;
    }

    return campos.sort((a, b) => {

        const ra =
            a.getBoundingClientRect();

        const rb =
            b.getBoundingClientRect();

        const distanciaA =
            Math.abs(
                window.innerWidth - ra.right
            ) +
            Math.abs(
                window.innerHeight - ra.bottom
            );

        const distanciaB =
            Math.abs(
                window.innerWidth - rb.right
            ) +
            Math.abs(
                window.innerHeight - rb.bottom
            );

        return distanciaA - distanciaB;

    })[0];
}

// Mantém marcado o editor real da Kick. O leitor de códigos deve ignorar
// qualquer conteúdo digitado ou colado dentro da caixa de mensagem.
function marcarCampoChatKMC() {
    const campo = encontrarCampoChat();

    if (campo) {
        campo.setAttribute("data-kmc-chat-input", "true");
    }

    const ativo = document.activeElement;
    if (ativo instanceof Element) {
        const campoAtivo = ativo.closest(SELETOR_CAMPO_EDITAVEL);
        if (campoAtivo) campoAtivo.setAttribute("data-kmc-chat-input", "true");
    }

    return campo;
}

function estaDentroDoCampoChatKMC(elemento) {
    if (!elemento || elemento.nodeType !== Node.ELEMENT_NODE) {
        return false;
    }

    if (
        elemento.closest('[data-kmc-chat-input="true"]') ||
        elemento.matches(SELETOR_CAMPO_EDITAVEL) ||
        elemento.closest(SELETOR_CAMPO_EDITAVEL)
    ) {
        return true;
    }

    return false;
}

// Se o mesmo código ainda está escrito em uma caixa editável, ele ainda não
// foi enviado. Isso evita converter a prévia do texto colado no compositor.
function codigoAindaEstaSendoDigitadoKMC(codigo) {
    const procurado = String(codigo || "").trim();
    if (!procurado) return false;

    const chave = procurado.toLowerCase();
    const expiraEm = codigosColadosRecentementeKMC.get(chave);
    const aindaNoEditor = [...document.querySelectorAll(SELETOR_CAMPO_EDITAVEL)].some(campo => {
        const conteudo = campo.value ?? campo.innerText ?? campo.textContent ?? "";
        return String(conteudo).includes(procurado);
    });

    if (expiraEm === Infinity) {
        // Só libera depois de detectar Enter, envio do formulário ou clique
        // em Enviar. Assim, esperar ou tirar o foco não libera o GIF.
        return true;
    }

    if (expiraEm && expiraEm > Date.now()) return true;
    if (expiraEm) codigosColadosRecentementeKMC.delete(chave);

    return aindaNoEditor;
}


// ========================================
// COLOCAR TEXTO PURO
// ========================================

function colocarTextoNoCampo(
    campo,
    mensagem
) {
    campo.focus();
    const texto = String(mensagem);

    if (campo.tagName === "TEXTAREA" || campo.tagName === "INPUT") {
        const prototype = campo.tagName === "TEXTAREA"
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

        if (descriptor && descriptor.set) {
            descriptor.set.call(campo, texto);
        } else {
            campo.value = texto;
        }

        campo.dispatchEvent(new Event("input", { bubbles: true }));
        return;
    }

    const selecao = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(campo);

    if (selecao) {
        selecao.removeAllRanges();
        selecao.addRange(range);
    }

    // insertText já dispara o evento input no contenteditable.
    // Um segundo InputEvent repetia a tag enviada na Kick.
    document.execCommand("insertText", false, texto);
}


// ========================================
// ENVIAR SOMENTE TEXTO
// ========================================

function enviarMensagemChat(
    mensagem
) {

    return new Promise(resolve => {

        const campo =
            encontrarCampoChat();

        if (!campo) {

            alert(
                "Não encontrei a caixa de mensagem do chat."
            );

            resolve(false);
            return;
        }

        const texto =
            String(mensagem);

        colocarTextoNoCampo(
            campo,
            texto
        );

        setTimeout(() => {

            campo.focus();

            // IMPORTANTE:
            // Enviamos SOMENTE keydown.
            // O keyup antigo podia fazer a Kick
            // interpretar a mensagem duas vezes.

            const eventoEnter =
                new KeyboardEvent(
                    "keydown",
                    {
                        key: "Enter",
                        code: "Enter",
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                    }
                );

            campo.dispatchEvent(
                eventoEnter
            );

            setTimeout(() => {

                resolve(true);

            }, 700);

        }, 300);
    });
}


// ========================================
// ENVIAR
// ========================================

document.getElementById(
    "kmc-send"
).addEventListener(
    "click",
    async evento => {

        evento.stopPropagation();

        if (
            enviandoMensagem ||
            fazendoUpload
        ) {
            return;
        }

        const campoUrl =
            document.getElementById(
                "kmc-url"
            );

        let valor =
            campoUrl.value.trim();

        if (imagemSelecionada) {

            fazendoUpload =
                true;

            const botaoEnviar =
                document.getElementById(
                    "kmc-send"
                );

            botaoEnviar.disabled =
                true;

            botaoEnviar.textContent =
                "⏳ Enviando imagem...";

            try {

                const url =
                    await enviarImagemParaBackground(
                        imagemSelecionada
                    );

                if (!url) {

                    alert(
                        "Não foi possível enviar a imagem." +
                        (erroUltimoUploadImagem ? "\n" + erroUltimoUploadImagem : "")
                    );

                    botaoEnviar.disabled =
                        false;

                    botaoEnviar.textContent =
                        "📤 Enviar";

                    fazendoUpload =
                        false;

                    return;
                }

                const codigo =
                    codificarImagem(url);

                if (!codigo) {

                    alert(
                        "Não foi possível preparar a imagem."
                    );

                    botaoEnviar.disabled =
                        false;

                    botaoEnviar.textContent =
                        "📤 Enviar";

                    fazendoUpload =
                        false;

                    return;
                }

                valor =
                    "KMCIMG_" + codigo;
                campoUrl.value = valor;
                document.getElementById("kmc-copy-code").style.display = "block";

                imagemSelecionada =
                    null;
                limparImagemOriginalSelecionada();

                limparPreviewImagem();
                const arquivo =
                    document.getElementById(
                        "kmc-file"
                    );

                arquivo.value = "";

            } catch (erro) {

                console.error(
                    "KickMediaChat - erro ao enviar imagem:",
                    erro
                );

                alert(
                    "Erro ao enviar a imagem."
                );

                botaoEnviar.disabled =
                    false;

                botaoEnviar.textContent =
                    "📤 Enviar";

                fazendoUpload =
                    false;

                return;
            }

            fazendoUpload =
                false;
        }

        if (!valor) {

            alert(
                "Escolha um GIF, imagem ou cole um link primeiro!"
            );

            return;
        }

        let mensagem = null;
        const tag = converterEnderecoParaTag(valor);
        if (tag) mensagem = tag;

        if (!mensagem) {

            alert(
                "Selecione um GIF, imagem ou cole um link válido."
            );

            return;
        }

        enviandoMensagem =
            true;

        const botaoEnviar =
            document.getElementById(
                "kmc-send"
            );

        botaoEnviar.disabled =
            true;

        botaoEnviar.textContent =
            "⏳ Enviando...";

        const enviado =
            await enviarMensagemChat(
                mensagem
            );

        if (enviado) {

            setTimeout(() => {

                campoUrl.value =
                    "";
                document.getElementById("kmc-copy-code").style.display = "none";

                imagemSelecionada =
                    null;
                limparImagemOriginalSelecionada();

                document.getElementById(
                    "kmc-file"
                ).value = "";

                limparPreviewImagem();

                fecharPainelAnimado(painel);
                fecharPainelAnimado(gifPainel);

                botaoEnviar.disabled =
                    false;

                botaoEnviar.textContent =
                    "📤 Enviar";

                enviandoMensagem =
                    false;

            }, 200);

        } else {

            botaoEnviar.disabled =
                false;

            botaoEnviar.textContent =
                "📤 Enviar";

            enviandoMensagem =
                false;
        }
    }
);


// ========================================
// GIPHY
// ========================================

function abrirMidiaAmpliadaKMC(midia) {
    if (!midia || !midia.src) return;

    let visualizador = document.getElementById("kmc-media-viewer");
    if (!visualizador) {
        visualizador = document.createElement("div");
        visualizador.id = "kmc-media-viewer";
        Object.assign(visualizador.style, {
            position: "fixed",
            inset: "0",
            zIndex: "2147483647",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            boxSizing: "border-box",
            background: "rgba(0, 0, 0, 0.88)",
            cursor: "zoom-out"
        });

        visualizador.addEventListener("click", () => visualizador.remove());
        document.body.appendChild(visualizador);
    }

    visualizador.replaceChildren();
    const ampliada = document.createElement("img");
    ampliada.src = midia.currentSrc || midia.src;
    ampliada.alt = midia.alt || "Imagem ampliada";
    Object.assign(ampliada.style, {
        display: "block",
        maxWidth: "min(96vw, 1400px)",
        maxHeight: "92vh",
        objectFit: "contain",
        borderRadius: "8px",
        cursor: "zoom-out"
    });
    ampliada.addEventListener("click", evento => {
        evento.stopPropagation();
        visualizador.remove();
    });
    visualizador.appendChild(ampliada);
}

document.addEventListener("keydown", evento => {
    if (evento.key === "Escape") {
        document.getElementById("kmc-media-viewer")?.remove();
    }
});

document.addEventListener("click", evento => {
    const midia = evento.target.closest?.('img[data-kmc-media="true"]');
    if (!midia || midia.closest("#kmc-panel, #kmc-gif-panel, #kmc-media-viewer")) return;
    evento.preventDefault();
    evento.stopPropagation();
    abrirMidiaAmpliadaKMC(midia);
}, true);

function prepararCliqueParaAmpliarKMC(imagem) {
    imagem.style.cursor = "zoom-in";
    imagem.title = "Clique para ampliar";
    return imagem;
}

function criarImagemGiphy(id) {

    const imagem =
        document.createElement("img");

    imagem.dataset.kmcMedia =
        "true";

    const linkOriginal =
        obterLinkOriginal(
            "gph:" + id
        );

    if (linkOriginal) {

        imagem.src =
            linkOriginal;

    } else {

        imagem.src =
            "https://media.giphy.com/media/" +
            encodeURIComponent(id) +
            "/giphy.gif";
    }

    imagem.alt =
        "GIF";

    imagem.style.maxWidth =
        "320px";

    imagem.style.maxHeight =
        "320px";

    imagem.style.borderRadius =
        "8px";

    imagem.style.display =
        "block";

    imagem.onerror =
        () => {

            const alternativa =
                "https://i.giphy.com/" +
                encodeURIComponent(id) +
                ".gif";

            if (
                imagem.src !==
                alternativa
            ) {

                imagem.src =
                    alternativa;
            }
        };

    return prepararCliqueParaAmpliarKMC(imagem);
}


// ========================================
// TENOR
// ========================================

function criarImagemTenor(id) {

    const imagem =
        document.createElement("img");

    imagem.dataset.kmcMedia =
        "true";

    const tag =
        "tnr:" + id;

    const linkOriginal =
        obterLinkOriginal(tag) || obterLinkOriginal("KMCGIF_TNR_" + id);

    if (linkOriginal) {

        let url =
            linkOriginal;

        const convertido =
            url.match(
                /media1\.tenor\.com\/m\/([A-Za-z0-9_-]+)(?:\/[^/?#]+)?/i
            );

        if (convertido) {

            url =
                "https://media.tenor.com/" +
                convertido[1] +
                "/tenor.gif";
        }

        imagem.src =
            url;

    } else {

        imagem.src =
            "https://media.tenor.com/" +
            encodeURIComponent(id) +
            "/tenor.gif";
    }

    imagem.alt =
        "GIF";

    imagem.style.maxWidth =
        "320px";

    imagem.style.maxHeight =
        "320px";

    imagem.style.borderRadius =
        "8px";

    imagem.style.display =
        "block";

    imagem.onerror =
        () => {

            const alternativa =
                "https://c.tenor.com/" +
                encodeURIComponent(id) +
                "/tenor.gif";

            if (
                imagem.src !==
                alternativa
            ) {

                imagem.src =
                    alternativa;
            }
        };

    return prepararCliqueParaAmpliarKMC(imagem);
}


// ========================================
// IMAGEM ENVIADA
// ========================================

function criarImagemEnviada(url) {

    const urlLimpa =
        String(url).split("?")[0].toLowerCase();

    // Se for vídeo, cria vídeo.
    if (
        urlLimpa.endsWith(".mp4") ||
        urlLimpa.endsWith(".webm") ||
        urlLimpa.endsWith(".mov")
    ) {

        const video =
            document.createElement("video");

        video.dataset.kmcMedia =
            "true";

        video.src =
            url;

        video.controls =
            true;

        video.autoplay =
            false;

        video.loop =
            true;

        video.muted =
            true;

        video.style.maxWidth =
            "320px";

        video.style.maxHeight =
            "320px";

        video.style.borderRadius =
            "8px";

        video.style.display =
            "block";

        return video;
    }

    const imagem =
        document.createElement("img");

    imagem.dataset.kmcMedia =
        "true";

    imagem.src =
        url;

    imagem.alt =
        "Imagem";

    imagem.style.maxWidth =
        "320px";

    imagem.style.maxHeight =
        "320px";

    imagem.style.borderRadius =
        "8px";

    imagem.style.display =
        "block";

    return prepararCliqueParaAmpliarKMC(imagem);
}


// ========================================
// PROCESSAR KMCIMG
// ========================================

function encontrarNomeUsuarioDaMensagemKMC(elemento) {
    let contexto = elemento?.parentElement || null;
    const padraoNome = /^(?!\d+$)[A-Za-z0-9_-]{2,32}:?$/;

    for (let nivel = 0; contexto && nivel < 5; nivel++, contexto = contexto.parentElement) {
        const candidatos = [...contexto.querySelectorAll("span, a, strong, b, div")]
            .filter(candidato => {
                const nome = (candidato.textContent || "").trim().replace(/:$/, "");
                const estilo = getComputedStyle(candidato);
                return padraoNome.test(nome) &&
                    candidato.getClientRects().length > 0 &&
                    estilo.display !== "none" &&
                    estilo.visibility !== "hidden";
            })
            .sort((a, b) => a.contains(b) ? 1 : b.contains(a) ? -1 : 0);

        for (const candidato of candidatos) {
            if (candidato === elemento || candidato.contains(elemento) || elemento.contains(candidato)) {
                continue;
            }
            return candidato;
        }
    }

    return null;
}

function carregarMidiasBloqueadasKMC() {
    try {
        const salvas = JSON.parse(localStorage.getItem("kmc_midias_bloqueadas") || "[]");
        return Array.isArray(salvas) ? salvas.filter(item => typeof item === "string") : [];
    } catch (erro) {
        return [];
    }
}

let midiasBloqueadasKMC = carregarMidiasBloqueadasKMC();

function normalizarChaveMidiaKMC(codigo) {
    return String(codigo || "").trim().toLowerCase();
}

function salvarMidiasBloqueadasKMC() {
    try {
        localStorage.setItem("kmc_midias_bloqueadas", JSON.stringify(midiasBloqueadasKMC));
    } catch (erro) {
        console.warn("KickMediaChat: não foi possível salvar as mídias bloqueadas.", erro);
    }
}

function criarBotaoBloqueioKMC(texto, titulo, aoClicar) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.textContent = texto;
    botao.title = titulo;
    botao.setAttribute("aria-label", titulo);
    Object.assign(botao.style, {
        flex: "0 0 auto",
        padding: "2px 5px",
        border: "0",
        borderRadius: "4px",
        background: "transparent",
        color: "#b9b9b9",
        fontSize: "13px",
        lineHeight: "1.2",
        cursor: "pointer"
    });
    botao.addEventListener("click", evento => {
        evento.preventDefault();
        evento.stopPropagation();
        aoClicar();
    });
    return botao;
}

function renderizarCodigoComMidia(elemento, codigo, url, midia, clicavel = true, legenda = "") {
    const chaveBloqueio = normalizarChaveMidiaKMC(codigo);
    const bloco = document.createElement("div");
    bloco.dataset.kmcMedia = "true";
    Object.assign(bloco.style, {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "4px"
    });

    if (midiasBloqueadasKMC.includes(chaveBloqueio)) {
        const aviso = document.createElement("span");
        aviso.textContent = "🚫 Mídia bloqueada";
        const botaoDesbloquear = criarBotaoBloqueioKMC("Desbloquear", "Desbloquear esta imagem ou GIF", () => {
            midiasBloqueadasKMC = midiasBloqueadasKMC.filter(item => item !== chaveBloqueio);
            salvarMidiasBloqueadasKMC();
            renderizarCodigoComMidia(elemento, codigo, url, midia, clicavel, legenda);
        });
        bloco.append(aviso, botaoDesbloquear);
        elemento.dataset.kmcProcessed = "true";
        elemento.replaceChildren(bloco);
        return;
    }

    const linkCodigo = document.createElement("span");
    linkCodigo.textContent = codigo;
    Object.assign(linkCodigo.style, {
        display: "inline-block",
        maxWidth: "100%",
        color: clicavel ? "#53fc18" : "#f1f1f1",
        fontSize: "11px",
        lineHeight: "1.4",
        textDecoration: clicavel ? "underline" : "none",
        overflowWrap: "anywhere",
        cursor: clicavel ? "pointer" : "text",
        userSelect: "text"
    });

    if (clicavel) {
        linkCodigo.setAttribute("role", "link");
        linkCodigo.tabIndex = 0;
        linkCodigo.title = "Abrir arquivo original";
        linkCodigo.addEventListener("click", evento => {
            evento.preventDefault();
            evento.stopPropagation();
            window.open(url, "_blank", "noopener,noreferrer");
        });
        linkCodigo.addEventListener("keydown", evento => {
            if (evento.key === "Enter" || evento.key === " ") {
                evento.preventDefault();
                window.open(url, "_blank", "noopener,noreferrer");
            }
        });
    } else {
        linkCodigo.addEventListener("copy", evento => {
            evento.preventDefault();
            evento.clipboardData?.setData("text/plain", codigo);
        });
    }

    if (legenda) {
        const textoLegenda = document.createElement("div");
        textoLegenda.textContent = legenda;
        Object.assign(textoLegenda.style, {
            maxWidth: "100%",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            color: "inherit"
        });
        bloco.append(textoLegenda);
    }

    const linhaCodigo = document.createElement("div");
    Object.assign(linhaCodigo.style, {
        display: "flex",
        alignItems: "center",
        gap: "5px",
        maxWidth: "100%"
    });
    const botaoBloquear = criarBotaoBloqueioKMC("🚫", "Bloquear esta imagem ou GIF", () => {
        if (!midiasBloqueadasKMC.includes(chaveBloqueio)) {
            midiasBloqueadasKMC.push(chaveBloqueio);
            salvarMidiasBloqueadasKMC();
        }
        renderizarCodigoComMidia(elemento, codigo, url, midia, clicavel, legenda);
    });
    linhaCodigo.append(linkCodigo, botaoBloquear);
    bloco.append(linhaCodigo, midia);

    elemento.dataset.kmcProcessed = "true";
    elemento.replaceChildren(bloco);
}

function processarCodigoKMC(
    elemento,
    texto,
    legenda = ""
) {

    if (
        !elemento ||
        !texto
    ) {
        return false;
    }

    const encontrado =
        texto.match(
            /KMCIMG_([A-Za-z0-9_.-]+)/i
        );

    if (!encontrado) {
        return false;
    }

    const codigo =
        encontrado[1];

    const url =
        decodificarImagem(codigo);

    if (
        !url ||
        !/^https:\/\/files\.catbox\.moe\//i.test(
            url
        )
    ) {
        return false;
    }

    if (
        elemento.dataset &&
        elemento.dataset.kmcProcessed === "true"
    ) {
        return true;
    }

    const media =
        criarImagemEnviada(url);

    renderizarCodigoComMidia(elemento, "KMCIMG_" + codigo, url, media, true, legenda);

    return true;
}


// ========================================
// PROCESSAR MENSAGEM
// ========================================

function processarElementoGif(elemento) {

    if (codigoColadoAguardandoEnvioKMC) {
        return false;
    }

    if (
        !elemento ||
        elemento.nodeType !== 1
    ) {
        return false;
    }

    if (
        elemento.dataset &&
        elemento.dataset.kmcProcessed ===
            "true"
    ) {
        return false;
    }

    if (
        elemento.dataset &&
        elemento.dataset.kmcMedia ===
            "true"
    ) {
        return false;
    }

    if (
        elemento.closest &&
        elemento.closest('[data-kmc-media="true"]')
    ) {
        return false;
    }

    if (
        elemento.closest &&
        elemento.closest(
            "#kmc-button, #kmc-panel, #kmc-gif-panel"
        )
    ) {
        return false;
    }

    if (
        elemento.matches &&
        elemento.matches(SELETOR_CAMPO_EDITAVEL)
    ) {
        return false;
    }

    if (
        elemento.closest &&
        elemento.closest(SELETOR_CAMPO_EDITAVEL)
    ) {
        return false;
    }

    if (estaDentroDoCampoChatKMC(elemento)) {
        return false;
    }

    if (
        elemento.querySelector &&
        elemento.querySelector(
            "img, video, picture, source"
        )
    ) {
        return false;
    }

    let texto =
        (elemento.textContent || "")
            .trim();

    let legenda = "";

    // A legenda só pode ser lida no span do conteúdo da mensagem da Kick.
    // Em divs maiores o texto também contém o nome do usuário e outras mensagens.
    const podeTerLegenda = elemento.tagName === "SPAN" && elemento.classList.contains("font-normal");
    const mensagemComMidia = podeTerLegenda ? texto.match(
        /^([\s\S]*\S)\s+(KMCIMG_[A-Za-z0-9_.-]+|KMCGIF_TNR_[A-Za-z0-9_.-]+|gph:[A-Za-z0-9_.-]+|tnr:[A-Za-z0-9_.-]+|img:https%3A%2F%2F[A-Za-z0-9%._~-]+)$/i
    ) : null;
    if (mensagemComMidia) {
        legenda = mensagemComMidia[1].trim();
        texto = mensagemComMidia[2];
    }

    if (!texto) {
        return false;
    }

    if (
        /^(?:KMCIMG_[A-Za-z0-9_.-]+|KMCGIF_TNR_[A-Za-z0-9_.-]+|gph:[A-Za-z0-9_.-]+|tnr:[A-Za-z0-9_.-]+|img:https%3A%2F%2F.+)$/i.test(texto) &&
        codigoAindaEstaSendoDigitadoKMC(texto)
    ) {
        return false;
    }


    // ====================================
    // KMCIMG
    // ====================================

    if (
        /^KMCIMG_[A-Za-z0-9_.-]+$/i.test(texto)
    ) {

        return processarCodigoKMC(
            elemento,
            texto,
            legenda
        );
    }

    const codigoTenorNovo = texto.match(/^KMCGIF_TNR_([A-Za-z0-9_.-]+)$/i);
    if (codigoTenorNovo) {
        const id = codigoTenorNovo[1];
        const imagem = criarImagemTenor(id);
        renderizarCodigoComMidia(elemento, "tnr:" + id, imagem.src, imagem, true, legenda);
        return true;
    }


    // ====================================
    // GIPHY
    // ====================================

    let resultado =
        texto.match(
            /^gph:([A-Za-z0-9_.-]+)$/
        );

    if (resultado) {

        const id =
            resultado[1];

        const imagem =
            criarImagemGiphy(id);

        renderizarCodigoComMidia(elemento, "gph:" + id, imagem.src, imagem, true, legenda);

        return true;
    }


    // ====================================
    // TENOR
    // ====================================

    resultado =
        texto.match(
            /^tnr:([A-Za-z0-9_.-]+)$/
        );

    if (resultado) {

        const id =
            resultado[1];

        const imagem =
            criarImagemTenor(id);

        renderizarCodigoComMidia(elemento, "tnr:" + id, imagem.src, imagem, true, legenda);

        return true;
    }


    // ====================================
    // COMPATIBILIDADE ANTIGA
    // ====================================

    resultado =
        texto.match(
            /^img:(https%3A%2F%2F.+)$/i
        );

    if (resultado) {

        const url =
            decodeURIComponent(
                resultado[1]
            );

        if (
            !/^https:\/\/files\.catbox\.moe\//i.test(
                url
            )
        ) {
            return false;
        }

        const imagem =
            criarImagemEnviada(
                url
            );

        renderizarCodigoComMidia(elemento, "img:" + resultado[1], url, imagem, true, legenda);

        return true;
    }

    return false;
}


// ========================================
// PROCURAR DENTRO
// ========================================

function procurarGifDentroElemento(
    elemento
) {

    if (codigoColadoAguardandoEnvioKMC) {
        return;
    }

    if (
        !elemento ||
        elemento.nodeType !== 1
    ) {
        return;
    }

    if (
        elemento.closest &&
        elemento.closest(
            "#kmc-button, #kmc-panel, #kmc-gif-panel"
        )
    ) {
        return;
    }

    if (
        elemento.closest &&
        elemento.closest('[data-kmc-media="true"]')
    ) {
        return;
    }

    if (
        elemento.matches?.(SELETOR_CAMPO_EDITAVEL) ||
        elemento.closest?.(SELETOR_CAMPO_EDITAVEL)
    ) {
        return;
    }

    if (estaDentroDoCampoChatKMC(elemento)) {
        return;
    }

    if (
        processarElementoGif(
            elemento
        )
    ) {
        return;
    }

    const filhos =
        elemento.querySelectorAll
            ? elemento.querySelectorAll(
                "span, p, div"
            )
            : [];

    for (
        const filho of filhos
    ) {

        if (
            processarElementoGif(
                filho
            )
        ) {
            return;
        }
    }

    // Procura também diretamente nos textos.
    // Isso resolve quando a Kick separa o KMCIMG
    // em nós de texto diferentes.

    const walker =
        document.createTreeWalker(
            elemento,
            NodeFilter.SHOW_TEXT
        );

    const textos = [];

    let no;

    while (
        (no = walker.nextNode())
    ) {

        if (
            no.parentElement &&
            no.parentElement.closest &&
            (no.parentElement.closest("#kmc-button, #kmc-panel, #kmc-gif-panel") ||
                no.parentElement.closest('[data-kmc-media="true"]') ||
                no.parentElement.closest(SELETOR_CAMPO_EDITAVEL) ||
                no.parentElement.closest('[data-kmc-chat-input="true"]'))
        ) {
            continue;
        }

        const texto =
            (no.nodeValue || "").trim();

        if (
            /^(?:KMCIMG_|KMCGIF_TNR_)[A-Za-z0-9_.-]+$/i.test(
                texto
            )
        ) {
            if (codigoAindaEstaSendoDigitadoKMC(texto)) {
                continue;
            }
            textos.push(no);
        }
    }

    for (
        const textoNode of textos
    ) {

        const codigo =
            textoNode.nodeValue.trim();

        if (/^KMCGIF_TNR_/i.test(codigo)) {
            const pai = textoNode.parentElement;
            if (pai && pai.dataset.kmcProcessed !== "true") {
                const id = codigo.replace(/^KMCGIF_TNR_/i, "");
                const imagem = criarImagemTenor(id);
                renderizarCodigoComMidia(pai, "tnr:" + id, imagem.src, imagem, true);
            }
            continue;
        }

        const url =
            decodificarImagem(
                codigo.replace(
                    /^KMCIMG_/i,
                    ""
                )
            );

        if (
            !url ||
            !/^https:\/\/files\.catbox\.moe\//i.test(
                url
            )
        ) {
            continue;
        }

        const pai =
            textoNode.parentElement;

        if (
            !pai ||
            pai.dataset.kmcProcessed ===
                "true"
        ) {
            continue;
        }

        renderizarCodigoComMidia(
            pai,
            codigo,
            url,
            criarImagemEnviada(url)
        );
    }
}


// ========================================
// OBSERVADOR
// ========================================

const observadorChat =
    new MutationObserver(
        mutations => {

            marcarCampoChatKMC();

            for (
                const mutation of mutations
            ) {

                const novosNos = mutation.type === "childList"
                    ? [...mutation.addedNodes]
                    : mutation.type === "characterData" && mutation.target.parentElement
                        ? [mutation.target.parentElement]
                        : [];

                for (const noAdicionado of novosNos) {
                    const node = noAdicionado.nodeType === Node.TEXT_NODE
                        ? noAdicionado.parentElement
                        : noAdicionado;

                    if (
                        !node ||
                        node.nodeType !== Node.ELEMENT_NODE
                    ) {
                        continue;
                    }

                    if (
                        node.dataset &&
                        (
                            node.dataset.kmcMedia ===
                                "true" ||
                            node.id ===
                                "kmc-button" ||
                            node.id ===
                                "kmc-panel" ||
                            node.id ===
                                "kmc-gif-panel"
                        )
                    ) {
                        continue;
                    }

                    const liberouAposEnvio = liberarProtecaoAoDetectarMensagemKMC(node);
                    procurarGifDentroElemento(
                        node
                    );

                    if (liberouAposEnvio) {
                        // A Kick pode recriar a linha logo após inseri-la.
                        // Revarre quando o chat terminar essa atualização.
                        agendarBuscaDeMidiaDepoisDoEnvioKMC();
                    }
                }
            }
        }
    );

observadorChat.observe(
    document.body,
    {
        childList: true,
        characterData: true,
        subtree: true
    }
);


// ========================================
// BUSCA DE SEGURANÇA
// ========================================

function procurarGifsNoChat() {

    reconciliarProtecaoDeCodigoColadoKMC();
    if (codigoColadoAguardandoEnvioKMC) {
        return;
    }

    marcarCampoChatKMC();

    if (enviandoMensagem) {
        return;
    }

    const elementos =
        document.querySelectorAll(
            "span, p, div"
        );

    for (
        const elemento of elementos
    ) {

        if (
            elemento.dataset &&
            elemento.dataset.kmcMedia ===
                "true"
        ) {
            continue;
        }

        processarElementoGif(
            elemento
        );
    }
}


// ========================================
// LOOP
// ========================================

let ultimaPagina =
    window.location.href;

setInterval(() => {

    verificarPagina();

    procurarGifsNoChat();

    if (
        window.location.href !==
        ultimaPagina
    ) {

        ultimaPagina =
            window.location.href;

        fecharPainelAnimado(painel);
        fecharPainelAnimado(gifPainel);

        imagemSelecionada =
            null;
        limparImagemOriginalSelecionada();
        limparPreviewImagem();

        enviandoMensagem =
            false;
    }

}, 1500);


// ========================================
// RESIZE
// ========================================

let quadroReposicionamento = 0;
function reposicionarPainelVisivel() {
    if (quadroReposicionamento) return;
    quadroReposicionamento = requestAnimationFrame(() => {
        quadroReposicionamento = 0;
        posicionarBotao();
        if (
            painel.style.display !== "none" ||
            gifPainel.style.display !== "none"
        ) {
            posicionarPainel();
        }
    });
}

window.addEventListener("resize", reposicionarPainelVisivel);
window.addEventListener("scroll", reposicionarPainelVisivel, { capture: true, passive: true });
window.visualViewport?.addEventListener("resize", reposicionarPainelVisivel);
window.visualViewport?.addEventListener("scroll", reposicionarPainelVisivel);

if (typeof ResizeObserver !== "undefined") {
    const observadorTamanhoPainel = new ResizeObserver(reposicionarPainelVisivel);
    observadorTamanhoPainel.observe(painel);
    observadorTamanhoPainel.observe(gifPainel);
}

verificarPagina();








})();


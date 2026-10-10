# KICKShot

Extensão independente para compartilhar imagens e GIFs no chat da Kick.

## Chrome e Brave

1. Baixe `KICKShot-v1.0.3.zip` na seção [Releases](https://github.com/darK01i/KICKShot/releases).
2. Extraia o ZIP.
3. Abra `chrome://extensions` ou `brave://extensions` e ative o modo de desenvolvedor.
4. Clique em **Carregar sem compactação** e selecione a pasta extraída que contém `manifest.json`.

## Firefox

1. Extraia o ZIP.
2. Abra `about:debugging` → **Este Firefox** → **Carregar extensão temporária**.
3. Selecione `Firefox/manifest.json` dentro da pasta extraída.

## Recursos

- Envio e edição de imagens no chat da Kick.
- Busca e compartilhamento de GIFs pelo GIPHY, sem precisar configurar uma chave de API.
- Visualização de mídias compatíveis compartilhadas no chat.

A busca de GIFs usa o servidor intermediário da KICKShot. Consulte `privacy.html` para saber como os serviços externos são usados.

## Testes

Os testes do módulo de códigos de mídia usam o test runner nativo do Node.js:

```sh
node --test tests/media-codes.test.js
```

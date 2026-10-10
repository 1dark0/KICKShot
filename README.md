# KICKShot

Extensão independente para compartilhar imagens e GIFs no chat da Kick.

## Chrome e Brave

1. Baixe a versão estável 1.0.6: [KICKShot para Chrome/Brave e Firefox](https://github.com/darK01i/KICKShot/releases/download/v1.0.6/KICKShot-v1.0.6.zip). A branch `main` contém a versão 1.0.7 em desenvolvimento, ainda sem release; essas mudanças não alteram o pacote 1.0.6 enviado à análise da Mozilla.
2. Extraia o ZIP.
3. Abra `chrome://extensions` ou `brave://extensions` e ative o modo de desenvolvedor.
4. Clique em **Carregar sem compactação** e selecione a pasta extraída que contém `manifest.json`.

## Firefox

1. Extraia o ZIP.
2. Abra `about:debugging` → **Este Firefox** → **Carregar extensão temporária**.
3. Selecione `Firefox/manifest.json` dentro da pasta extraída.

## Recursos

- Envio e edição de imagens no chat da Kick.
- Mensagem opcional antes da imagem ou GIF enviado.
- Prévia do texto digitado junto da imagem ou GIF.
- Busca e compartilhamento de GIFs pelo GIPHY, sem precisar configurar uma chave de API.
- Visualização de mídias compatíveis compartilhadas no chat.
- Bloqueio local de mídias pelo código e pela impressão digital do arquivo, para reconhecer o mesmo arquivo publicado com outro código.

A busca de GIFs usa o servidor intermediário da KICKShot. O bloqueio pela impressão digital compara o arquivo exato localmente e não reconhece versões editadas da mídia. Consulte `privacy.html` para saber como os serviços externos são usados.

## Testes

Os testes do módulo de códigos de mídia usam o test runner nativo do Node.js:

```sh
node --test tests/media-codes.test.js
```

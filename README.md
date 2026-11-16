# Controle de Gastos (offline, PWA)

Funciona 100% sem internet depois do primeiro acesso. Os dados ficam só no aparelho (localStorage).
Recursos: gastos e receitas, resumo mensal com gráfico, metas mensais, objetivos de investimento e backup (exportar/importar).

## Publicar no GitHub Pages
1. Crie uma conta em github.com e um repositório **público** novo (ex.: `controle-gastos`).
2. Na página do repositório: Add file > Upload files. Arraste os ARQUIVOS (não o .zip) desta pasta e clique em Commit changes.
3. Settings > Pages > Source: "Deploy from a branch" > Branch: `main`, pasta `/ (root)` > Save.
4. Aguarde 1 a 2 minutos. O endereço será `https://SEU-USUARIO.github.io/controle-gastos/`.

## Instalar no celular
1. Abra o endereço no Chrome do celular, COM internet, e deixe a página carregar por completo.
2. Menu (três pontinhos) > "Instalar app" ou "Adicionar à tela inicial".
3. Para testar: ative o modo avião e abra o app pelo ícone.

## Importante
- Os dados são por aparelho e por navegador. Limpar os dados do site ou desinstalar o app apaga tudo: use Exportar (aba Resumo) para guardar backups.
- Para atualizar o app: substitua os arquivos no repositório. A nova versão aparece na segunda vez que o app for aberto com internet.
- Quem tiver o endereço pode abrir o app, mas nunca vê os seus dados (eles não saem do seu celular).

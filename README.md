# Pede-aí — Painel Administrativo

Painel admin single-file para o sistema de delivery **Pede-aí**.

## Funcionalidades

- **Pedidos em tempo real** — acompanhe e atualize o status de cada pedido (Novo → Preparo → Entrega → Concluído)
- **Relatórios financeiros** — faturamento, ticket médio, taxas de entrega, pedidos cancelados com valor perdido
- **Gráficos** — pedidos por hora, top produtos, formas de pagamento
- **Extrato de entregas** — tabela filtrável + exportação CSV com coluna de status (CONCLUIDO/CANCELADO)
- **Gestão de produtos** — cadastro individual ou importação em massa via CSV (até 500 linhas)
- **Categorias** — criação e remoção com proteção contra ID duplicado
- **Configurações** — dados da loja, horário de funcionamento, taxas por bairro, cor primária, logo
- **Impressão térmica** — ESC/POS via QZ Tray (58mm/80mm), fallback automático pelo navegador
- **Alertas sonoros** — buzina sintética via Web Audio API, sem dependência de arquivo de áudio

## Tecnologias

| Camada | Biblioteca |
|---|---|
| UI | Tailwind CSS (CDN) + Font Awesome |
| Banco de dados | Firebase Firestore v11.6.1 |
| Autenticação | Firebase Auth |
| Gráficos | Chart.js |
| Impressão | QZ Tray (ESC/POS) |

## Como usar

1. Abra o arquivo `index.html` em qualquer servidor web (ou direto no navegador)
2. Faça login com o e-mail e senha cadastrados no **Firebase Authentication**
3. Configure os dados da loja na aba **Configurações**

## Segurança

- XSS sanitizado via `escapeHtml()` em todos os pontos de saída HTML
- Validação de entrada em formulários (nome, preço, horários, WhatsApp, cor hex)
- Regras de acesso configuradas no **Firebase Firestore Rules**
- Favicon dinâmico com cor validada por regex antes de injetar no SVG
- Log de erros JS em `localStorage` para diagnóstico sem Sentry

## Impressora Térmica

Requer o [QZ Tray](https://qz.io/download/) instalado e rodando na máquina.
Na primeira conexão, clique em **Configurações → Detectar Impressoras**, selecione a impressora e salve.
Em produção, configure `QZ_CERT_PEM` e `QZ_SIGN_ENDPOINT` no código para eliminar o popup de segurança.

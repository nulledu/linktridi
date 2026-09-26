# Espelho — não edite aqui

Este repositório é gerado por `npm run espelho` a partir do Gaius
(`sistemaempreendedores/dashvendas`). Qualquer commit feito diretamente aqui
é apagado no próximo envio: o espelho é reescrito por inteiro.

Origem: `97a84315` (main)

## O que este deploy serve

Só as páginas públicas — funis (`/f`), páginas e tutoriais (`/p`), vitrine
(`/l`) e os assets. Todo o resto responde 404, inclusive `/login`.

## Variáveis obrigatórias na Vercel

| Variável | Valor |
|---|---|
| `APENAS_PLAYER` | `1` |
| `PLAYER_API_BASE` | URL do Gaius em produção (sem barra no fim) |

Com `PLAYER_API_BASE` definido o site pergunta as páginas ao Gaius e **não**
fala com o Supabase — por isso nenhuma chave de banco mora neste projeto.

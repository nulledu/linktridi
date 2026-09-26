-- Domínio parado sai do monitor (17/09/2026).
--
-- Oito endereços da gaveta estavam pintando a página de status de vermelho com
-- "O endereço não leva a lugar nenhum: falta apontar o DNS" — que é a verdade:
-- estão registrados, ninguém apontou o DNS e ninguém vai apontar por enquanto.
-- Monitor que mostra falha esperada não avisa nada: quem olha aprende a
-- ignorar o vermelho, e aí o dia em que cai o que importa passa batido.
--
-- A chave é o interruptor que já existe: `infra_dominios.ativo` (ficha em
-- Acessos & Infra › Domínios). Desmarcado, o domínio sai de
-- `status_dominios_ativos()`, o coletor reescreve a lista na hora seguinte e o
-- cartão limpa (a faxina de `status_registrar` apaga o item em até 2 h).
-- `decisao` e `vencimento` ficam como estão: isto não é decisão de renovar, é
-- "não vigie o que ainda não existe".
--
-- Pra voltar a vigiar: marque "Domínio ativo" na ficha — ou rode este arquivo
-- com `set ativo = true`. Nada aqui apaga domínio.
--
-- Idempotente: pode rodar quantas vezes quiser.

update public.infra_dominios
   set ativo = false, updated_at = now()
 where lower(trim(both '/' from regexp_replace(trim(dominio), '^https?://', '')))
       in (
         'carimbotridi.com.br',
         'embalagensperson.com.br',
         'maindx.com.br',
         'produtostridi.com.br',
         'tridigaius.com.br',
         'tridipersonalizados.com.br',
         'tridisistemas.com.br',
         'tridpersonalizados.com.br'
       )
   and coalesce(ativo, true);

-- Limpeza imediata do que já está na tela (opcional — a faxina de
-- `status_registrar` faz isso sozinha em até 2 h, e só DEPOIS que o coletor
-- reescreveu a lista; rodar antes disso só devolve o item na foto seguinte).
delete from public.status_itens
 where grupo = 'Dominios'
   and nome not in (select host from public.status_dominios_ativos());

update public.status_incidentes i
   set fim = now(), duracao_s = greatest(0, extract(epoch from now() - i.inicio)::int)
 where i.fim is null
   and not exists (select 1 from public.status_itens s where s.key = i.key);

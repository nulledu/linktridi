-- Engajamento do criativo no armazém diário da Meta: curtidas (post_reaction),
-- comentários (comment) e compartilhamentos (post). Vêm no mesmo `actions` que
-- a sincronização já pede — depois deste SQL, a próxima sincronização grava.
--
-- Aditivo e re-rodável. Linha antiga fica com engagement_metrics_collected nulo
-- e a apresentação mostra "–" (nunca zero) até aquele dia ser sincronizado de novo.

alter table public.meta_ad_insights_daily add column if not exists engagement_metrics_collected boolean;
alter table public.meta_ad_insights_daily add column if not exists post_reactions numeric;
alter table public.meta_ad_insights_daily add column if not exists post_comments numeric;
alter table public.meta_ad_insights_daily add column if not exists post_shares numeric;

-- O PostgREST guarda o esquema em cache: sem isso a API continua dizendo que a
-- coluna não existe por alguns minutos.
notify pgrst, 'reload schema';

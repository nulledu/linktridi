-- Vínculo opcional do login (colaborador) a um usuário do ERP legado.
-- Permite conectar a conta de acesso à pessoa correspondente no ERP (usuarios.user_id).

alter table employees add column if not exists erp_user_id text;

create index if not exists employees_erp_user_idx on employees (erp_user_id);

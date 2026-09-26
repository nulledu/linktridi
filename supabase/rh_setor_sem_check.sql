-- RH · setor deixa de ser lista fechada no banco
--
-- `employees.setor` nasceu em 0003_colaboradores.sql com
--   check (setor in ('Vendas','Produção','Estoque','Administrativo'))
-- enquanto a ficha do RH oferece os 13 setores de `RH_SETORES` (lib/rh/tipos.ts).
-- Salvar "Marketing", "Design", "TI"… estourava
--   new row for relation "employees" violates check constraint "employees_setor_check"
--
-- A lista viva é a do código: ela muda quando a empresa muda, e duplicá-la numa
-- constraint só garante que as duas divirjam. O banco passa a aceitar texto;
-- quem oferece as opções é a ficha.
--
-- Idempotente: pode rodar quantas vezes quiser.

alter table employees drop constraint if exists employees_setor_check;

-- "Estoque" existia só na constraint antiga e sumiu da lista da ficha; quem já
-- estava nele continua lá (a ficha mostra o valor gravado mesmo fora da lista).

package com.tridi.app.data

import kotlinx.serialization.Serializable

@Serializable
data class Funcionario(
    val id: String,
    val nome: String,
    val setor: String? = null,
    val tem_pin: Boolean = false,
    val foto_url: String? = null,
    val presente: Boolean = true,       // bateu ponto e está dentro; false = "Fora"
)

// Um material da ficha técnica, com a quantidade JÁ CALCULADA pra este lote.
// Desce no pull junto da atividade automática (offline-first, como as peças).
@Serializable data class MaterialDaFicha(val nome: String, val quantidade: Int = 1)

@Serializable
data class Atividade(
    val id: String,
    val categoria: String = "",
    val tarefa: String = "",
    val detalhe: String? = null,
    val para_id: String = "",
    val para_nome: String = "",
    val status: String = "pendente",            // pendente | em_andamento | concluida
    val quantidade_alvo: Int = 1,
    val quantidade_feita: Int = 0,
    val tempo_estimado_min: Int? = null,
    val iniciada_at: String? = null,
    val concluida_at: String? = null,
    val produto_nome: String? = null,
    val produto_imagem: String? = null,        // foto do produto/peça (mostrada no ping estilo Uber)
    val instrucoes: String? = null,            // o que a pessoa tem que fazer (texto)
    val demo_url: String? = null,              // foto/gif da demonstração "o que fazer"
    val aceita_at: String? = null,             // quando a pessoa aceitou (relógio começa)
    val urgente: Boolean = false,              // fura a fila e chama mais forte
    val setor: String? = null,
    val foto_url: String? = null,
    val impedida: Boolean = false,
    val motivo_impedimento: String? = null,
    // ── A cadeia (defaults = servidor mais velho não manda e nada quebra) ──
    // Criada pela automação de estoque: ganha o selo e o botão "Não precisa
    // fazer" (op `dispensar`). Atividade de gente se devolve, não se dispensa.
    val automatica: Boolean = false,
    // "Estoque caiu a 8 (mínimo 20) — repõe até 50." — por que ela existe.
    val origem_frase: String? = null,
    // O que usar, da ficha técnica, já na quantidade deste lote.
    val materiais: List<MaterialDaFicha> = emptyList(),
)

// Ação na fila offline (outbox). client_id garante idempotência no servidor.
@Serializable
data class PendingOp(
    val client_id: String,
    val tipo: String,                            // iniciar | pausar | concluir | bloquear | devolver | dispensar | pedir_insumo | consumir
    val atividade_id: String? = null,
    val colaborador_id: String,
    val colaborador_nome: String? = null,
    val quantidade_feita: Int? = null,
    val foto_url: String? = null,
    val foto_local: String? = null,              // caminho local da foto ainda não enviada
    val motivo: String? = null,                  // bloquear: por que não dá pra fazer
    val produto_nome: String? = null,
    val quantidade: Int? = null,
    val observacao: String? = null,
    // consumir: as etiquetas bipadas antes de começar. O servidor dá baixa
    // nelas e amarra à atividade — é o "usou tal material" do histórico.
    val codigos: List<String> = emptyList(),
    // consumir: por que começou SEM bipar (etiqueta rasgada, leitor parado…).
    val dispensa_motivo: String? = null,
    // Quando aconteceu AQUI. A bancada trabalha sem Wi-Fi e a fila sobe junto
    // horas depois; sem isto a manhã inteira ficaria carimbada no segundo do
    // flush — a mesma armadilha já vivida na fila offline do ponto.
    val ocorrido_em: String? = null,
    // devolver/dispensar: o vale do supervisor que liberou a recusa. O servidor
    // não aplica recusa sem ele (lib/atividades-autorizacao.ts).
    val autorizacao: String? = null,
    // intervalo_volta: fim oficial (ISO) e início da janela ("09:30").
    val intervalo_fim: String? = null,
    val janela: String? = null,
    val created_at: Long = 0,
)

// Recusa esperando o supervisor. Enquanto existe, o tablet fica TRAVADO na tela
// do código (como o cancelamento no caixa do supermercado). Persiste no
// state.json: reiniciar o tablet não é jeito de escapar da trava.
@Serializable
data class TravaRecusa(
    val atividade_id: String,
    val tarefa: String,
    val tipo: String,                 // devolver | dispensar | bipe (começar sem bipar)
    val motivo: String,
    val colaborador_id: String,
    val colaborador_nome: String,
    val criado_em: Long = 0,
    // tipo "bipe": a chave do motivo (MOTIVOS_DISPENSA) que vai no consumir.
    val motivo_chave: String? = null,
)

@Serializable data class AutorizarReq(
    val etapa: String,
    val atividade_id: String,
    val tipo: String,
    val motivo: String? = null,
    val colaborador_id: String? = null,
    val colaborador_nome: String? = null,
    val pin: String? = null,
    val vale: String? = null,
)
@Serializable data class Supervisor(val id: String = "", val nome: String = "")
@Serializable data class AutorizarResp(
    val supervisor: Supervisor? = null,
    val vale: String? = null,
    val error: String? = null,
    val restantes: Int? = null,
    val segundos: Int? = null,
    val ok: Boolean = false,
)

// Por que a pessoa começou sem bipar. Vem do servidor no pull (junto com a
// ordem, nunca numa chamada à parte: a bancada trabalha sem Wi-Fi, e uma lista
// que dependesse de rede sumiria justo na hora de dizer "não deu pra bipar").
@Serializable data class MotivoDispensa(val key: String, val label: String)

@Serializable
data class DeviceConfig(
    val exige_bipe: Boolean = false,
    val motivos_dispensa: List<MotivoDispensa> = emptyList(),
    // Nulo = servidor mais velho: mantém o que já sabia.
    val intervalos: List<JanelaIntervalo>? = null,
)

// Intervalo da produção (lib/ponto-intervalos.ts). Horas "HH:MM" no relógio
// do tablet; `pessoas` = ids de login de quem para nessa janela.
@Serializable
data class JanelaIntervalo(
    val rotulo: String = "Intervalo",
    val inicio: String = "",
    val fim: String = "",
    val pessoas: List<String> = emptyList(),
)

// Atividade que o intervalo pausou e ainda espera a pessoa tocar pra voltar.
@Serializable
data class PausaDoIntervalo(
    val atividade_id: String? = null,      // nulo = estava sem atividade, mas também tem que tocar
    val colaborador_id: String,
    val colaborador_nome: String,
    val janela: String = "",               // início da janela ("09:30")
    val dia: String = "",                  // aaaa-mm-dd do tablet
    val fim: String = "",                  // fim da janela ("09:40") — base do atraso
)

// Rede caída, tablet recém-instalado, servidor mais velho: a lista NUNCA pode
// ficar vazia, senão "Não deu pra bipar" abre uma tela sem opção nenhuma e a
// saída de emergência deixa de existir bem na hora em que ela é necessária.
// As chaves são as mesmas de MOTIVOS_DISPENSA (lib/atividade-bipes.ts).
val MOTIVOS_DISPENSA_PADRAO = listOf(
    MotivoDispensa("sem_etiqueta", "O material não tem etiqueta"),
    MotivoDispensa("etiqueta_ilegivel", "A etiqueta rasgou / não lê"),
    MotivoDispensa("leitor_parado", "O leitor não está funcionando"),
    MotivoDispensa("sem_material", "Esta atividade não usa material"),
)

@Serializable
data class Produto(
    val id: String,
    val nome: String,
    val categoria: String? = null,
    val imagem_url: String? = null,
)

@Serializable
data class AppState(
    val token: String? = null,
    val nomeMesa: String? = null,
    val setor: String? = null,
    val currentWorkerId: String? = null,         // "bate ponto": quem está logado neste tablet
    val currentWorkerNome: String? = null,
    val funcionarios: List<Funcionario> = emptyList(),
    val atividades: List<Atividade> = emptyList(),
    val produtos: List<Produto> = emptyList(),
    val pending: List<PendingOp> = emptyList(),
    val lastSync: String? = null,
    // Descanso pós-conclusão POR PESSOA (id → epoch ms em que pode receber outra) e
    // ritmo GLOBAL da fila (quando a próxima ordem pode cair).
    // Vivem aqui, e não em `remember{}` da tela: o tablet é kiosk e reinicia (ver
    // BootReceiver). Em memória, o descanso zerava no restart e a próxima ordem
    // caía na hora, por cima de quem tinha acabado de concluir.
    val descansoAte: Map<String, Long> = emptyMap(),
    val proximaOrdemEm: Long = 0,
    // Exigir o bipe da etiqueta do material antes de aceitar. Mora AQUI (e não
    // em memória) porque o tablet é kiosk e reinicia, e porque ele trabalha
    // offline: a regra tem que valer no arranque, antes do primeiro pull.
    val exigeBipe: Boolean = false,
    val motivosDispensa: List<MotivoDispensa> = emptyList(),
    // Recusa pedida e ainda não decidida pelo supervisor (ver TravaRecusa).
    val travaRecusa: TravaRecusa? = null,
    // Intervalos: a lista (vale offline e no arranque), o que já tocou hoje
    // ("aaaa-mm-dd|HH:MM|ini/fim" — reiniciar não toca de novo) e as pausas
    // esperando o toque de volta.
    val intervalos: List<JanelaIntervalo> = emptyList(),
    val intervaloToques: List<String> = emptyList(),
    val intervaloPausas: List<PausaDoIntervalo> = emptyList(),
)

// Identidade do tablet: o mínimo pra continuar pareado. Vive num arquivo PRÓPRIO
// (identity.json), reescrito só quando muda — então um crash no meio de um sync
// (que reescreve o state.json grande) não leva o pareamento junto.
@Serializable data class Identity(val token: String? = null, val nomeMesa: String? = null, val setor: String? = null)

// ── Respostas do servidor ──
@Serializable data class DeviceInfo(val nome_mesa: String? = null, val setor: String? = null)
@Serializable data class ProvisionResp(val token: String? = null, val device: DeviceInfo? = null, val error: String? = null)
@Serializable data class PullResp(
    val server_time: String? = null,
    val device: DeviceInfo? = null,
    val colaboradores: List<Funcionario> = emptyList(),
    val atividades: List<Atividade> = emptyList(),
    val produtos: List<Produto> = emptyList(),
    // Nulo = servidor mais velho, que ainda não manda config. Aí o tablet
    // MANTÉM o que já sabia em vez de voltar pro padrão — desligar a exigência
    // por causa de um deploy antigo seria o galpão parando de bipar sem
    // ninguém ter decidido isso.
    val config: DeviceConfig? = null,
)
@Serializable data class ClaimResp(val atividade: Atividade? = null, val ja_tinha: Boolean = false, val error: String? = null)
@Serializable data class UploadResp(val url: String? = null, val error: String? = null)
@Serializable data class PushResult(val client_id: String = "", val status: String = "", val detail: String? = null)
@Serializable data class PushResp(val results: List<PushResult> = emptyList())

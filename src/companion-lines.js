// What the companions say between the scenes (src/companions.js says when). Each voice as in docs/historia.md §4 and
// §9: Kael short and dry, an ex-Collector who knows how the Crown thinks; Lyra light and sarcastic over three hundred
// years of things she refuses to forget ("meu bem"); Nix sells and buys everything, memories first; Hulda grumbles,
// and talks to Ormun out loud.
//
// BARKS: a line when the party walks into a place (zone), or near something (thing: part of an interactable's name;
// at: [tx, ty, radius]). `say` lists who could say it, in order: the first one in the party says it. `lines` is a
// fixed exchange (everyone in `who` must be there). `min`/`max`: approval each speaker needs. `if(F)`: story flags.
// Each one is said once per playthrough. WALKS: talks on the road, after a while of walking, in this order.


export const BARKS = [
  // ---------------------------------------------------------------- the prologue: the valley
  { id: "v_camp", map: "vale", zone: "Acampamento do Vale", if: (F) => F.awake && !F.patrol && !F.escape, say: [
    ["kael", "Barraca, fogo, um baú. Já dormi em lugar pior. Já dormi em lugar pior ontem."],
    ["lyra", "Toda vez que eu volto a um acampamento, ele está um pouco menor. Ou eu estou um pouco mais velha."]] },
  { id: "v_woods", map: "vale", zone: "Bosque de Brumafolha", if: (F) => F.awake && !F.escape, say: [
    ["kael", "Folha prateada por baixo. Quando o vento vira, o bosque inteiro pisca. Meu sargento dizia que era o vale contando a gente."],
    ["lyra", "Brumafolha. Por causa das folhas, e por causa da bruma. Os humanos dão nome a lugar como quem descreve um prato."]] },
  { id: "v_lake", map: "vale", zone: "Lago Espelhado", if: (F) => F.awake && !F.escape, say: [
    ["lyra", "Não olhe muito para a água, meu bem. Ela devolve o rosto, mas às vezes devolve o de outro dia."],
    ["kael", "Água parada demais. Eu não confio em nada que fica parado tanto tempo."]] },
  { id: "v_ruins", map: "vale", zone: "Ruínas de Velmoor", if: (F) => F.awake && !F.escape, say: [
    ["lyra", "(baixo) Eu conheço o desenho dessas colunas. Não me pergunte de onde. Eu também queria saber."],
    ["kael", "Fumaça verde. Goblins. Não é o pior jeito de começar uma manhã. Também não é o melhor."]] },
  { id: "v_river", map: "vale", zone: "Rio Cardo", if: (F) => F.awake && !F.escape, say: [
    ["kael", "O Cardo desce até a fronteira. Tudo o que a Coroa não quer, ele leva rio abaixo. Gente também."],
    ["lyra", "Um rio é a coisa mais parecida com memória que existe: nunca é a mesma água, e todo mundo jura que é o mesmo rio."]] },
  { id: "v_deer", map: "vale", thing: "Corça", if: (F) => F.awake && !F.deer_seen && !F.deer_mercy && !F.deer_left, say: [
    ["kael", "Olha os olhos dela. Eu já vi esse olhar em gente. Na porta das casas que eu cobrava."],
    ["lyra", "Ela não tem medo da gente. Bicho sem medo é bicho que esqueceu alguma coisa."]] },
  { id: "v_tree", map: "vale", thing: "Árvore dos Nomes", if: (F) => F.awake, say: [
    ["lyra", "Nomes riscados na casca. Os elfos fazem isso também, só que por dentro. Dói mais e aparece menos."],
    ["kael", "Tem nome aqui de gente que eu prendi. (ele passa o dedo num, e tira) Não. Engano meu. Acho."]] },
  { id: "v_marker", map: "vale", thing: "Marco de pedra", if: (F) => F.awake, say: [
    ["lyra", "Velmoor. A pedra lembra do nome. É mais do que o mundo inteiro consegue."],
    ["kael", "Um marco de estrada que não leva a lugar nenhum. A Coroa ia adorar. Cobraria pedágio."]] },
  { id: "v_after_clan_fight", map: "vale", zone: "Ruínas de Velmoor", if: (F) => F.clan === "fight" && !F.escape, say: [
    ["lyra", "Eles tinham uma criança lá dentro, sabia? Tinham uma criança e uma panela no fogo."],
    ["kael", "Goblin ou gente, quem defende a fogueira luta igual. Eu sei. Já estive do outro lado da fogueira."]] },
  { id: "v_after_truce", map: "vale", zone: "Ruínas de Velmoor", if: (F) => (F.clan === "truce" || F.goblin_pact) && !F.escape, say: [
    ["kael", "Ninguém morreu hoje por causa de uma conversa. Anota isso. Não acontece sempre."],
    ["lyra", "Você conversou com uma goblin velha como quem conversa com uma rainha. Ela vai lembrar disso. Goblins lembram de pouca coisa, e lembram bem."]] },
  // ---------------------------------------------------------------- the Relicário
  { id: "r_in", map: "relicario", at: [11, 26, 4], say: [
    ["lyra", "(ela para no primeiro degrau) Frio. Não de inverno. Frio de quarto onde ninguém entra há muito tempo."],
    ["kael", "Branco demais. Lugar limpo assim, debaixo da terra, alguém limpa. Quem?"]] },
  { id: "r_faces", map: "relicario", thing: "Relevo com o seu rosto", say: [
    ["kael", "(ele olha o relevo, depois você, depois o relevo) Eu não vou perguntar. Eu vou só andar mais perto de você daqui pra frente."],
    ["lyra", "Esculpiram o seu rosto antes de você nascer. (ela engole em seco) Isso não é coisa que se faz com um estranho."]] },
  // ---------------------------------------------------------------- Vau-de-Cardo
  { id: "a_dock", map: "vau", zone: "Cais do Cardo", say: [
    ["kael", "Vau-de-Cardo. Paliçada nova, portão velho. Gente demais pra muralha de menos."],
    ["lyra", "Cheira a peixe, fumaça e medo. Toda cidade de fronteira tem o mesmo perfume."]] },
  { id: "a_camp", map: "vau", zone: "Acampamento dos refugiados", say: [
    ["kael", "Barracas da Coroa. Eu conheço a lona. Eu já carreguei essa lona. (pausa) Pra outro tipo de gente."],
    ["lyra", "Eles vieram do norte, fugindo da Bruma. Repara: ninguém conversa sobre de onde veio. Não é tristeza. Eles não lembram."]] },
  { id: "a_market", map: "vau", zone: "Mercado dos refugiados", say: [
    ["nix", "Mercado de quem perdeu tudo. Os preços são ótimos. Ninguém lembra quanto as coisas custavam."],
    ["kael", "Repara quem está vendendo e quem está comprando. Quem vende é do norte. Quem compra é da guarnição."],
    ["lyra", "Uma barraca de nabo, uma de cebola e uma de coisas que alguém já amou. Tudo na mesma bancada."]] },
  { id: "a_garrison", map: "vau", zone: "Guarnição da Coroa", say: [
    ["kael", "(Kael puxa a gola para cima) Melhor eu não ficar parado aqui. Tem cara nessa guarnição que me conhece de antes."],
    ["nix", "Guarnição da Coroa. O cofre fica atrás. Eu não estou olhando para o cofre. Você está olhando para mim olhando para o cofre."],
    ["lyra", "Soldados contando sacos de farinha e sacos de gente com a mesma letra. Repara no livro deles."]] },
  { id: "a_tavern", map: "vau", zone: "Taverna do Sabiá Cego", say: [
    ["lyra", "O Sabiá Cego. Um nome para quem não quer ser encontrado e quer que todo mundo saiba disso."],
    ["kael", "Taverna boa é a que tem duas saídas. Essa tem três. Gostei."]] },
  { id: "a_board", map: "vau", thing: "Quadro de avisos", if: (F) => !F.poster_seen, say: [
    ["kael", "Quadro da Coroa. Melhor ler antes que alguém leia por você."],
    ["lyra", "Avisos. A cidade inteira pendurada em pregos. Vamos ver se tem o seu nome."]] },
  { id: "a_poster_after", map: "vau", thing: "Quadro de avisos", if: (F) => F.poster_seen && !F.ch1_done, say: [
    ["nix", "Duzentas peças pela sua mão. Eu cobraria o dobro. Não que eu esteja pensando nisso."],
    ["kael", "(Kael fica entre você e o quadro, sem dizer por quê.)"],
    ["lyra", "Cubra a mão quando passar pela guarnição, meu bem. Não é vergonha. É aritmética."]] },
  { id: "a_well", map: "vau", thing: "Poço", say: [
    ["lyra", "Nomes riscados na borda do poço. Gente que quis deixar escrito que existiu. Os elfos achariam isso vulgar. Eu acho a coisa mais bonita desta cidade."],
    ["nix", "Um poço com nomes. Se eu vendesse a pedra, teria comprador. Gente pagaria para ter um nome escrito em algum lugar."]] },
  { id: "a_iara_after", map: "vau", zone: "Acampamento dos refugiados", if: (F) => F.iara === "forgot", say: [
    ["kael", "(Kael não olha para a barraca de Iara.) Ele levou o que ela tinha de mais pesado. Ela vai achar que ficou mais leve. Esse é o truque."],
    ["lyra", "Ela chamou o filho de 'menino'. (Lyra aperta o cajado) Eu já ouvi uma mãe fazer isso. Em Lethiel. Depois da Poda."]] },
  { id: "a_iara_saved", map: "vau", zone: "Acampamento dos refugiados", if: (F) => F.iara && F.iara !== "forgot", say: [
    ["kael", "A Iara ainda sabe o nome do filho. Por hoje. (ele quase sorri) Por hoje é bastante."],
    ["lyra", "Você ficou entre um Coletor e uma mãe. Isso tem um custo, sabe. Bom saber que você paga."]] },
  { id: "a_morning", map: "vau", zone: "Vau-de-Cardo", if: (F) => F.rested1 && !F.ch1_done, say: [
    ["kael", "De manhã a cidade parece outra. Não melhor. Outra."],
    ["lyra", "Dormiu? Você falou durante a noite. Uma língua que eu não ouvia fazia muito tempo. (ela não diz qual)"]] },
  // ---------------------------------------------------------------- the crossing of the Cardo
  { id: "t_road", map: "travessia", zone: "Estrada do Cardo", say: [
    ["kael", "Estrada aberta, mato dos dois lados. Bom lugar pra emboscada. Eu sei porque eu já fiz uma aqui."],
    ["nix", "Estrada do Cardo. A última vez que eu passei por aqui, eu estava carregando a lembrança do casamento de outra pessoa. Pesava mais do que parece."],
    ["lyra", "Daqui pra frente, o reino. Para trás, o vale. Eu nunca sei de qual lado eu fico."]] },
  { id: "t_fog", map: "travessia", zone: "A borda da Bruma", say: [
    ["lyra", "Não chegue mais perto, meu bem. Ela já sabe o seu cheiro."],
    ["kael", "Daqui eu não passo sem você. A sua mão é a única coisa que a gente tem contra isso."],
    ["nix", "Ela é bonita, não é? Tudo o que come lembrança é bonito. Funciona como isca."]] },
  { id: "t_ford", map: "travessia", zone: "O Vau", say: [
    ["kael", "Água pela cintura no meio. Segura a bolsa no alto. E a mão também."],
    ["lyra", "Atravessar um rio a pé. Faz trezentos anos que eu faço isso e ainda molho a barra do vestido."]] },
  { id: "t_shrine", map: "travessia", thing: "Santuário de Nhara", say: [
    ["lyra", "Nhara. Os pescadores ainda lembram dela, então ela ainda existe. Um pouco. O suficiente para uma vela."],
    ["kael", "Eu nunca rezei pra ninguém. Mas eu nunca roubei de um altar também. Tem coisa que a gente não faz."],
    ["nix", "Três moedas e um anzol. Eu poderia. Não vou. Fica registrado que eu poderia."]] },
  { id: "t_goblins", map: "travessia", zone: "O Vau", if: (F) => F.goblin_pact, say: [
    ["kael", "Os goblins de Gorza guardando o vau. Pela gente. Se o meu sargento visse isso, ele morria de novo."],
    ["lyra", "O pacto se cumpre. Eles lembram. (ela sorri) Eu disse que goblins lembram bem."]] },
  // ---------------------------------------------------------------- south of the woods (chapter 2)
  { id: "b_in", map: "bosque", zone: "Sul do Bosque", say: [
    ["hulda", "Árvore. Árvore. Árvore com cara de quem não gosta de anã. Árvore."],
    ["lyra", "O bosque fica mais quieto quanto mais perto do Mosteiro. Os pássaros também vão lá pra esquecer?"],
    ["kael", "Trilha batida. Muita gente passa aqui, e ninguém volta pelo mesmo caminho. Repara nas pegadas: só vão."]] },
  { id: "b_moths", map: "bosque", zone: "Clareira das mariposas", say: [
    ["nix", "Mariposas da Bruma. Na Feira, um pote delas vale ouro. Ninguém quer saber o que elas comeram."],
    ["lyra", "Elas pousam nas lanternas porque a luz lembra alguma coisa. Coitadas. Eu também faço isso."],
    ["kael", "Não deixa encostar. Uma pousou no braço de um soldado meu. Ele esqueceu como se segura uma espada, e nunca mais aprendeu."]] },
  { id: "b_cabin", map: "bosque", zone: "Cabana do lenhador", say: [
    ["kael", "Machado afiado, lenha empilhada, ninguém em casa. Ele está esperando alguém."],
    ["lyra", "Uma cabana com dois pratos na mesa e uma cadeira só usada. (ela não diz mais nada)"]] },
  { id: "b_camp", map: "bosque", zone: "Clareira dos lenhadores", say: [
    ["kael", "Bom lugar pra dormir. Costas pro morro, fogo baixo, ninguém vê de longe."],
    ["hulda", "Clareira de lenhador. Toco pra sentar, toco pra encostar, toco pra rezar. Ormun gosta de toco. É meio pedra."]] },
  // ---------------------------------------------------------------- the Monastery
  { id: "m_gate", map: "mosteiro", zone: "Portão do Mosteiro", say: [
    ["lyra", "Lavanda e pão. Eles sabem receber. É isso que me dá medo."],
    ["kael", "Muro baixo, portão aberto, nenhum guarda. Lugar que não tem medo de ninguém é lugar que já ganhou."],
    ["nix", "Que lugar mais bonito. Eu odeio lugar bonito. Sempre tem alguém pagando por ele."]] },
  { id: "m_garden", map: "mosteiro", zone: "Jardim do Véu", say: [
    ["lyra", "Chá de bruma. Em Lethiel a gente planta a mesma erva. Chama de 'misericórdia'. (ela arranca uma folha e esmaga) Não tem nada de misericórdia."],
    ["kael", "A Coroa compra essa erva no atacado. Eu já carreguei os sacos. Eu achava que era tempero."],
    ["nix", "Um canteiro desses, na Feira, compraria uma rua. Todo mundo tem alguma coisa que quer esquecer."],
    ["hulda", "Ah, não. Esse cheiro. Esse cheiro eu conheço de dentro. (ela cospe no canteiro) Pronto. Agora tem gosto de anã."]] },
  { id: "m_yard", map: "mosteiro", zone: "Pátio do Mosteiro", if: (F) => F.c2_arrived, say: [
    ["kael", "As crianças brincam de procissão. Ninguém ensinou. Elas viram."],
    ["lyra", "Crianças de branco, limpas, rindo. É a coisa mais bonita que eu vi em semanas, e eu quero ir embora."]] },
  { id: "m_after_hulda", map: "mosteiro", zone: "Pátio do Mosteiro", if: (F) => F.hulda_joined && !F.c2_choice, say: [
    ["hulda", "Olha bem pra essa gente, Ormun. Gentil, bem lavada, servindo chá. É assim que se derruba uma montanha: com gentileza e muita água."]] },
  { id: "c_kitchen", map: "claustro", zone: "Cozinha", say: [
    ["nix", "Cozinha boa, chaleira grande, e ninguém olhando. A melhor porta de qualquer casa é a da cozinha."],
    ["kael", "Chaleira no fogo dia e noite. Ninguém aqui toma água, repara."],
    ["lyra", "Cheiro de pão. Eles acertam em tudo o que é pequeno."]] },
  { id: "c_dorm", map: "claustro", zone: "Dormitório dos órfãos", say: [
    ["lyra", "Camas pequenas, lençóis brancos, nenhum brinquedo. Criança sem brinquedo não é criança sem tristeza. É criança sem ontem."],
    ["kael", "(Kael para na porta e não entra.) Vai você. Eu espero aqui."],
    ["hulda", "Nenhuma marca de faca na cabeceira. Nenhum nome riscado. Em casa de criança anã tem nome riscado até no teto."]] },
  { id: "c_chapel", map: "claustro", zone: "Capela do Véu", say: [
    ["hulda", "Capela sem deus. Só o véu. Eles rezam pro nada, e o nada responde muito bem, pelo visto."],
    ["lyra", "Um altar a coisa nenhuma. Os elfos achariam isso de muito bom gosto. É o que me assusta."],
    ["kael", "Silêncio de igreja. Eu sempre achei que era respeito. É costume."]] },
  { id: "c_silence", map: "claustro", zone: "Ala do Silêncio", say: [
    ["kael", "Corredor estreito, portas de ferro. Isto não é dormitório. Eu sei o que é. Eu trabalhei num."],
    ["nix", "Ala do Silêncio. Que nome bonito pra uma cadeia."],
    ["lyra", "(Lyra fala muito baixo, quase sem voz) Não acorda nada aqui, meu bem. Nada."]] },
  { id: "c_book", map: "claustro", thing: "Livro de nomes", say: [
    ["kael", "Um livro de entrada e saída. Igual ao do Tributo. A mesma letra, juro. Eles aprendem no mesmo lugar."],
    ["nix", "Um livro inteiro de nomes que ninguém mais usa. Você sabe quanto isso vale? Não em ouro. Em gente."],
    ["lyra", "Eles escrevem o nome antes de levar. Para quê? (ela fecha os olhos) Para alguém lembrar. Ainda que seja só o livro."]] },
];

export const WALKS = [
  // ---------------------------------------------------------------- the prologue, with the companion of the start
  { id: "w_kael_coin", map: "vale", who: ["kael"], if: (F) => F.awake && !F.escape, lines: [
    ["kael", "Trezentas peças. Sabe quanto um Coletor ganha por ano? Cento e vinte. Quem paga trezentas por um serviço de uma semana sabe o que está mandando buscar."]] },
  { id: "w_lyra_old", map: "vale", who: ["lyra"], if: (F) => F.awake && !F.escape, lines: [
    ["lyra", "Você deve estar pensando quantos anos eu tenho. Todo mundo pensa. Trezentos e doze. Não, eu não lembro de tudo. Eu lembro do que importa, e de umas receitas de bolo."]] },
  { id: "w_kael_fog", map: "vale", who: ["kael"], if: (F) => F.patrol && !F.escape, lines: [
    ["kael", "Os goblins da patrulha comiam lembrança porque é o que tem. A Coroa come porque é o que dá lucro. (pausa) Eu não sei qual é pior. Eu só sei de qual lado eu trabalhava."]] },
  { id: "w_lyra_dream", map: "vale", who: ["lyra"], if: (F) => F.patrol && !F.escape, lines: [
    ["lyra", "A mulher de cabelos de prata, no seu sonho. Ela segura a lanterna com a mão esquerda ou a direita? (ela espera) Esquece. Pergunta de velha."]] },
  { id: "w_kael_tome", map: "vale", who: ["kael"], if: (F) => F.tome_with && !F.escape, lines: [
    ["kael", "O menino anda igual a mim quando eu tinha a idade dele. Olhando pro chão, pra ver se acha moeda. (ele ri pelo nariz) Eu achei uma vez. Gastei em doce. Não me arrependo."]] },
  { id: "w_lyra_tome", map: "vale", who: ["lyra"], if: (F) => F.tome_with && !F.escape, lines: [
    ["lyra", "Esse menino fala mais do que eu. Em trezentos anos, é a primeira vez que alguém consegue. Eu estou impressionada e um pouco ofendida."]] },
  // ---------------------------------------------------------------- Kael and Nix (§4: they know each other, and don't say how)
  { id: "w_kael_nix1", who: ["kael", "nix"], if: (F) => F.act1 && !F.c2, lines: [
    ["nix", "Você anda com a mão no peito, Coletor. Igual a quem carrega alguma coisa que pode quebrar."],
    ["kael", "E você anda com a mão na bolsa dos outros."],
    ["nix", "Cada um protege o que é seu."]] },
  { id: "w_kael_nix2", who: ["kael", "nix"], if: (F) => F.c2, lines: [
    ["kael", "Arquivo Real, sétimo ano do Tributo, terceira prateleira. Isso te diz alguma coisa?"],
    ["nix", "Diz que você tem boa memória. É uma coisa rara hoje em dia. Eu cobraria caro por ela."],
    ["kael", "(Kael não responde, e anda mais rápido.)"]] },
  // ---------------------------------------------------------------- Lyra and Nix
  { id: "w_lyra_nix1", who: ["lyra", "nix"], if: (F) => F.act1, lines: [
    ["nix", "Elfa de Lethiel, solta pelo mundo. Na Feira me ofereceram, uma vez, a lembrança de uma Poda. Dizem que é como cair num lago quente."],
    ["lyra", "Você comprou?"],
    ["nix", "Não. Era cara demais. (pausa) E eu tive medo de gostar."]] },
  { id: "w_lyra_nix2", who: ["lyra", "nix"], if: (F) => F.c2, lines: [
    ["lyra", "Quantas lembranças que não são suas você já bebeu, Nix?"],
    ["nix", "Perdi a conta. Literalmente: uma delas era de um contador."]] },
  // ---------------------------------------------------------------- Hulda and everybody
  { id: "w_hulda_kael", who: ["hulda", "kael"], if: (F) => F.hulda_joined, lines: [
    ["hulda", "Você tem cara de soldado da Coroa, rapaz."],
    ["kael", "Tinha."],
    ["hulda", "Ormun diz que não existe 'tinha' pra cara. A cara fica. (ela dá um tapinha no braço dele) Mas ele também diz que a cara é a parte menos importante. Ele é uma montanha, ele entende de fachada."]] },
  { id: "w_hulda_lyra", who: ["hulda", "lyra"], if: (F) => F.hulda_joined, lines: [
    ["hulda", "Elfa. Quantos anos?"],
    ["lyra", "Trezentos e doze."],
    ["hulda", "Criança. Ormun tem nove mil. E ainda assim ele esquece onde deixou as próprias pedras. Caem na minha cabeça."]] },
  { id: "w_hulda_nix", who: ["hulda", "nix"], if: (F) => F.hulda_joined, lines: [
    ["nix", "Quanto um milagre de Ormun valeria na Feira?"],
    ["hulda", "Ele não está à venda."],
    ["nix", "Todo mundo está, anã. Só muda a moeda."],
    ["hulda", "(Hulda pensa muito tempo) ...A moeda dele é gente que lembra. Você tem? Então não pode pagar."]] },
  { id: "w_hulda_ormun", who: ["hulda"], if: (F) => F.hulda_joined, lines: [
    ["hulda", "(olhando o céu) Sim, Ormun, eu sei. Sim. Não, eu não vou pedir desculpa pra Madre. Porque não. Porque ela me deu chá. (pausa) Isso foi um trovão ou foi você concordando?"]] },
  // ---------------------------------------------------------------- with approval: what they only say to someone they trust, or don't
  { id: "w_kael_close", who: ["kael"], min: { kael: 3 }, if: (F) => F.act1, lines: [
    ["kael", "Sabe o que eu reparei? Você pergunta antes de decidir. Eu passei oito anos com gente que decidia antes de perguntar. (ele olha pra frente) É bom. Continua."]] },
  { id: "w_kael_cold", who: ["kael"], max: { kael: -2 }, if: (F) => F.act1, lines: [
    ["kael", "Eu já trabalhei pra gente que dava ordens desse jeito. Eu sei como termina. Termina comigo cobrando a conta."]] },
  { id: "w_lyra_close", who: ["lyra"], min: { lyra: 3 }, if: (F) => F.act1, lines: [
    ["lyra", "Eu ando gostando de você, meu bem. Isso é um problema. Gente de vida curta é péssimo investimento."]] },
  { id: "w_lyra_cold", who: ["lyra"], max: { lyra: -2 }, if: (F) => F.act1, lines: [
    ["lyra", "Eu já vi muita gente decidir rápido o que outras pessoas vão esquecer. Normalmente com a minha família na sala."]] },
  { id: "w_nix_close", who: ["nix"], min: { nix: 3 }, lines: [
    ["nix", "Você é a primeira pessoa em anos com quem eu não fiz as contas de quanto valeria. (ela pensa) Tá bom, fiz. Mas fiz por hábito."]] },
  { id: "w_hulda_close", who: ["hulda"], min: { hulda: 3 }, lines: [
    ["hulda", "Ormun gosta de você. Eu sei porque não caiu nenhuma pedra na sua cabeça desde ontem. Isso, pra ele, é um abraço."]] },
  // ---------------------------------------------------------------- after the big choices, on the road
  { id: "w_after_echo_trade", if: (F) => !!F.eco_trade, say: [
    ["nix", "Uma lembrança por um poder. Como foi? Doeu? Ficou um buraco? Desculpa, é que eu nunca vi ninguém vender pra própria mão."],
    ["kael", "Você ainda sabe o que entregou? Não o que era. Que entregou. (ele espera) É assim que começa."],
    ["hulda", "Tem uma linha em branco em você, eu vejo. Ormun também vê. Ele não gosta de buraco em parede."],
    ["lyra", "Você me conta, um dia, o que era? Não agora. Um dia, quando eu puder guardar por você."]] },
  { id: "w_after_crown", if: (F) => F.c2_choice === "crown", say: [
    ["kael", "Eu não vou falar disso. (muito depois) Cinquenta homens. Eu falei."],
    ["hulda", "A Coroa. Ormun não diz nada. É a primeira vez em sessenta anos que ele não diz nada."],
    ["lyra", "Eu queria ter certeza de que você errou. Eu não tenho. É pior assim."]] },
  { id: "w_after_attack", if: (F) => F.c2_choice === "attack", say: [
    ["hulda", "Pedra certa, eu disse. Ainda acho que era a pedra certa. Só que a montanha caiu pro outro lado."],
    ["kael", "A gente bateu na porta. Ela saiu pelos fundos com as crianças. Eu já vi isso acontecer. Do lado de quem batia."]] },
  { id: "w_after_peace", if: (F) => F.c2_choice === "peace", say: [
    ["lyra", "A fita na sua bolsa. Não desamarra, eu tentei de noite. (ela sorri torto) Eu tentei com magia."],
    ["hulda", "Paz. Eu gosto da palavra. Eu desconfio de quem usa muito."]] },
];

/** Where each one stands, in words (Diário, the "Grupo" tab): cold, wary, neutral, close, loyal. */
export const BOND = {
  kael: ["Kael não te olha nos olhos, e não ajuda mais do que o necessário.", "Kael anda um passo atrás, de olho na sua mão.", "Kael ainda está decidindo o que acha de você.", "Kael confia em você, do jeito dele: em silêncio.", "Kael anda do seu lado sem perguntar para onde."],
  lyra: ["Lyra fala com você como fala com os anciãos de Lethiel: com educação, e de longe.", "Lyra sorri menos quando você fala.", "Lyra acha você interessante, o que para ela é muito.", "Lyra guarda o que você diz. Ela não guarda quase nada.", "Lyra lembraria de você daqui a trezentos anos."],
  nix: ["Nix já fez as contas de quanto você vale, e não gostou do resultado.", "Nix mantém a mão perto da bolsa quando você está perto.", "Nix ainda está avaliando o lote.", "Nix parou de calcular o seu preço. Quase.", "Nix não venderia você. Nem por muito."],
  hulda: ["Hulda reza por você em voz alta, para você ouvir, e não é elogio.", "Hulda resmunga o seu nome para Ormun.", "Hulda ainda não decidiu se você é pedra ou areia.", "Hulda diz que Ormun gosta de você. Ela também.", "Hulda pediria um milagre por você, mesmo que fosse o último."],
};

/** When approval runs out: once, they say so. Making up for it brings some of it back; standing firm doesn't. */
export const CONFRONT = {
  kael: {
    lines: ["Para um pouco. (Kael segura você pelo braço, não forte) Eu passei oito anos fazendo o que mandavam sem perguntar por quê.", "Eu saí disso. Eu não vou entrar de novo, nem por você. Se continuar assim, eu ando junto, mas não ajudo mais."],
    ask: "(Ele espera. A mão dele ainda está no seu braço.)",
    mend: "Você tem razão. Eu vou ouvir mais.", hold: "Eu decido o que eu faço, Kael.",
    mended: "(Ele solta o braço.) Tá. Vou cobrar. Eu sei cobrar.", held: "(Ele solta o braço.) Então eu só ando junto.",
  },
  lyra: {
    lines: ["Meu bem, eu vou ser franca, que é coisa que eu raramente sou.", "Eu fugi de um povo inteiro que decidia por todo mundo o que era melhor esquecer. Eu não fugi trezentos anos pra seguir alguém igual."],
    ask: "(Lyra espera, sem o sorriso de sempre.)",
    mend: "Eu não quero ser assim. Me diz quando eu for.", hold: "Eu não sou os anciãos de Lethiel.",
    mended: "Eu vou dizer. Pode ter certeza que eu vou dizer.", held: "Não. Ainda não. (ela vai na frente, e não espera)",
  },
  nix: {
    lines: ["Chefe. Uma pergunta de negócio: o que eu ganho andando com você?", "Porque até agora eu só vi você jogar fora o que vale e guardar o que não vale. Eu sei reconhecer um mau negócio."],
    ask: "(Nix brinca com uma moeda entre os dedos, sem olhar para você.)",
    mend: "Fica. Eu vou te ouvir mais.", hold: "O negócio é esse. Pegar ou largar.",
    mended: "Hmm. Fico. Mas a partir de agora eu anoto.", held: "Eu fico. Por enquanto. Mas eu não arrisco o pescoço por quem eu não entendo.",
  },
  hulda: {
    lines: ["Escuta aqui. (Hulda bate o martelo no chão) Ormun me tirou de uma cela. Não foi pra eu seguir alguém que faz o que a Madre faria.", "Mais uma dessas e eu rezo por você. E não vai ser reza boa."],
    ask: "(A anã cruza os braços. Uma pedrinha cai de lugar nenhum perto do seu pé.)",
    mend: "Eu ouvi. Você e Ormun.", hold: "Reza o que quiser, Hulda.",
    mended: "Bom. Ormun ouviu também. (ela olha pra cima) Ele disse que vai ficar de olho.", held: "Eu vou. Em voz alta.",
  },
};

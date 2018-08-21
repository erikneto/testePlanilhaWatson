const assistant = require('watson-developer-cloud').AssistantV1;
const XLSX = require('xlsx');
let concurrent = 0;
let args = require('parse-cli-arguments')({
    options: {
        userWCS: {
            alias: 'u'
        },
        pwdWCS: {
            alias: 'p'
        },
        sourceFile: {
            alias: 'f'
        }
    }
});

let wa = new assistant({
    version: '2018-07-10',
    username: args.userWCS || '753607af-d1bc-4b32-a0c1-0f139f52bdda',
    password: args.pwdWCS || '6s4Y4GrlNfWG',
});

const wb = XLSX.readFile(args.sourceFile || 'Massa de Testes POC 2ª demo v2.xlsx');

const modos = [
    'Fácil',
    'Médio',
    'Completo'
];
prmTeste = modos.map(m => performTest(m));
main();
async function main() {
    await excluirTesteAnterior().catch(error => console.error(error))

    Promise.all(prmTeste)
        .then((result) => {
            XLSX.writeFile(wb, args.sourceFile);
            console.log('done');
        })
        .catch((error) => {
            console.error(error)
        })
}


function performTest(title) {
    return new Promise(async (resolve, reject) => {
        const treino = XLSX.utils.sheet_to_json(wb.Sheets[`Treinamento ${title}`], {
            raw: true
        });
        const teste = XLSX.utils.sheet_to_json(wb.Sheets[`Teste ${title}`], {
            raw: true
        });
        const retorno = await treinarWatson(treino).catch(error => console.error(error));
        const resultado = await efetuarTeste(teste, retorno.workspace_id);
        const newSheet = XLSX.utils.json_to_sheet(resultado);
        wb.Sheets[`Teste ${title}`] = newSheet;
        return resolve(retorno);
    })
}

function efetuarTeste(teste, wks_id) {
    return new Promise(async (resolve, reject) => {
        prmPerguntas = teste.map(e => enviaPerguntaAoWatson(e.PERGUNTA, wks_id));
        Promise.all(prmPerguntas).then((result) => {
                return resolve(result)
            })
            .catch((error) => {
                return reject(error)
            })
    });
}

function enviaPerguntaAoWatson(pergunta, wks_id) {
    return new Promise(async (resolve, reject) => {
 
        while (concurrent > 100) {
            await esperar(100);
        }
        concurrent++;
        wa.message({
            input: {
                'text': pergunta
            },
            workspace_id: wks_id
        }, async (err, response) => {
            try {
                concurrent--;
                if (err) {
                    console.log(`erro ao perguntar: ${pergunta}`)
                    return resolve(await enviaPerguntaAoWatson(pergunta, wks_id));
                }
                const resultToReturn = response.intents.length ? response.intents[0] : {
                    intent: 'N/A',
                    confidence: 0
                };
                resultToReturn.PERGUNTA = pergunta;
                //console.log(`Testado ${pergunta} e o retorno foi ${resultToReturn.intent} com ${resultToReturn.confidence*100}% de confiança`)
                return resolve(resultToReturn)
                    
            } catch (error) {
                console.log(error);
                return reject(error);
            }
        })
    });
}

function esperar(ms) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            return resolve(true)
        }, ms);
    });
}

function treinarWatson(treino) {
    return new Promise((resolve, reject) => {
        let intents = treino.reduce((total, item) => {
            const currentItem = total.find(i => i.intent === item['Resposta ID ']) || {
                intent: item['Resposta ID '],
                examples: []
            }
            if (!currentItem.examples.length) {
                total.push(currentItem);
            }
            if (!currentItem.examples.find(e => e.text.toUpperCase() === item.Pergunta.toUpperCase()))
                currentItem.examples.push({
                    'text': item.Pergunta
                });
            return total;
        }, [])
        intents = intents.map(i => {
            i.intent = i.intent.toString();
            return i;
        });
        workspace = {
            name: 'API test',
            description: 'Example workspace created via API.',
            intents: intents
        };
        wa.createWorkspace(workspace, async (err, response) => {
            if (err) {
                console.error(err);
                reject(err);
            } else {
                await watsonTreinado(response.workspace_id);
                resolve(response);
            }
        });
    })
}

function watsonTreinado(wks_id) {
    return new Promise((resolve, reject) => {
        const timer = setInterval(() => {
            console.log(`Aguardando treino de ${wks_id}`);
            wa.getWorkspace({
                workspace_id: wks_id
            }, (err, response) => {
                if (err) {
                    console.error(err);
                } else {
                    if (response.status === 'Available') {
                        clearInterval(timer);
                        return resolve(true);
                    }
                }
            })
        }, 5000);
    });
}

function excluirTesteAnterior() {
    return new Promise((resolve, reject) => {
        wa.listWorkspaces(async (err, response) => {
            if (err) {
                console.error(err);
                return reject(err);
            } else {
                const prmExcluir = response.workspaces.filter(f => f.name === 'API test').map(w => excluiWorkspace(w.workspace_id));
                await Promise.all(prmExcluir).catch(error => console.error(error));
                return resolve(true)
            }
        });
    })
}

function excluiWorkspace(wks_id) {
    return new Promise((resolve, reject) => {
        wa.deleteWorkspace({
            workspace_id: wks_id
        }, (err, response) => {
            if (err) {
                return reject(err);
            } else {
                return resolve(response);
            }
        });
    })
}
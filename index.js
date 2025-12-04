const { app, BrowserWindow, ipcMain } = require('electron');
const { Client, Authenticator } = require('minecraft-launcher-core');
const { Auth } = require('msmc');
const path = require('path');
const fs = require('fs');

// --- CONSTANTES DO SISTEMA ---
// Define a pasta oficial de dados do usuário (AppData/Roaming/...)
const SYSTEM_ROOT = app.getPath('userData');
const GAME_ROOT = path.join(SYSTEM_ROOT, 'minecraft');
const CONFIG_PATH = path.join(SYSTEM_ROOT, 'config.json');

// --- DISCORD RPC ---
let rpc;
const clientId = '1445920534935244820'; 

function iniciarDiscord() {
    try {
        const DiscordRPC = require('discord-rpc');
        const client = new DiscordRPC.Client({ transport: 'ipc' });
        client.on('error', (e) => { });
        client.login({ clientId }).catch(() => { });
        rpc = client;
    } catch (e) { rpc = null; }
}

const launcher = new Client();
let janelaPrincipal;
const authManager = new Auth("select_account");

// --- CONFIGURAÇÃO ---
function carregarConfig() {
    const padrao = { ram: "4", sessao: null, width: 854, height: 480, jvmArgs: "", temaCor: "#7289da", temaFundo: "padrao", mods: { fps: false, sprint: true, fullbright: false, keystrokes: true, armor: false, potions: false, motionblur: false, tnttimer: false } };
    if (!fs.existsSync(CONFIG_PATH)) return padrao;
    try { const salvo = JSON.parse(fs.readFileSync(CONFIG_PATH)); return { ...padrao, ...salvo, mods: { ...padrao.mods, ...(salvo.mods || {}) } }; } catch (e) { return padrao; }
}

function salvarConfig(dados) {
    const novo = { ...carregarConfig(), ...dados };
    if (dados.mods) novo.mods = { ...carregarConfig().mods, ...dados.mods };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(novo));
}

function criarJanela() {
    janelaPrincipal = new BrowserWindow({
        width: 1000, height: 650, frame: false, resizable: true,
        webPreferences: { nodeIntegration: true, contextIsolation: false },
        backgroundColor: '#171717', icon: path.join(__dirname, 'icon.png'), show: false
    });
    janelaPrincipal.loadFile('index.html');
    janelaPrincipal.maximize();
    janelaPrincipal.show();
}

app.whenReady().then(() => { criarJanela(); iniciarDiscord(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// --- INTERFACE ---
ipcMain.on('app-minimize', () => janelaPrincipal.minimize());
ipcMain.on('app-maximize', () => janelaPrincipal.isMaximized() ? janelaPrincipal.unmaximize() : janelaPrincipal.maximize());
ipcMain.on('app-close', () => app.quit());

// --- LOGIN (MSMC) ---
ipcMain.handle('tentar-auto-login', async () => {
    const config = carregarConfig();
    if (!config.sessao) return null;
    try {
        if (rpc) rpc.setActivity({ details: 'No Menu Principal', state: 'Logado', largeImageKey: 'logo', startTimestamp: Date.now() }).catch(() => { });
        const xboxManager = await authManager.refresh(config.sessao);
        const token = await xboxManager.getMinecraft();
        return { sucesso: true, nome: token.profile.name, uuid: token.profile.id, token: token.mclc() };
    } catch (error) { return null; }
});

ipcMain.on('fazer-logout', () => salvarConfig({ sessao: null }));

ipcMain.on('fazer-login', async (event) => {
    try {
        const xboxManager = await authManager.launch("electron");
        const token = await xboxManager.getMinecraft();
        salvarConfig({ sessao: xboxManager.save() });
        event.sender.send('login-sucesso', { nome: token.profile.name, uuid: token.profile.id, token: token.mclc() });
    } catch (error) { console.log("Erro login:", error); }
});

// --- SISTEMA INTELIGENTE DE PREPARAÇÃO ---

// 1. Verifica e Copia o OptiFine da pasta do projeto para o AppData
function migrarOptiFineSeNecessario() {
    const optifinePathLocal = path.join(__dirname, 'minecraft', 'libraries', 'optifine', 'OptiFine', '1.8.9_HD_U_M5', 'OptiFine-1.8.9_HD_U_M5.jar');
    const destinoDir = path.join(GAME_ROOT, 'libraries', 'optifine', 'OptiFine', '1.8.9_HD_U_M5');
    const destinoArquivo = path.join(destinoDir, 'OptiFine-1.8.9_HD_U_M5.jar');

    if (fs.existsSync(optifinePathLocal) && !fs.existsSync(destinoArquivo)) {
        console.log("[Sistema] Migrando arquivo do OptiFine para a nova pasta...");
        if (!fs.existsSync(destinoDir)) fs.mkdirSync(destinoDir, { recursive: true });
        fs.copyFileSync(optifinePathLocal, destinoArquivo);
    }
}

// 2. Prepara o JSON (Só funciona se a base já existir)
function prepararJSONOptiFine() {
    const versionPath = path.join(GAME_ROOT, 'versions', '1.8.9-OptiFine');
    const vanillaJsonPath = path.join(GAME_ROOT, 'versions', '1.8.9', '1.8.9.json');
    const optiJsonPath = path.join(versionPath, '1.8.9-OptiFine.json');
    
    if (!fs.existsSync(versionPath)) fs.mkdirSync(versionPath, { recursive: true });

    // Se não tiver a base, retorna false para indicar que precisamos baixar a base primeiro
    if (!fs.existsSync(vanillaJsonPath)) return false;

    try {
        const vanillaData = JSON.parse(fs.readFileSync(vanillaJsonPath, 'utf8'));
        
        let todasAsLibs = vanillaData.libraries || [];
        todasAsLibs.push({
            "name": "net.minecraft:launchwrapper:1.12",
            "downloads": {
                "artifact": {
                    "path": "net/minecraft/launchwrapper/1.12/launchwrapper-1.12.jar",
                    "sha1": "111e7bea9c968cdb3d06ef4632bf7ff0824d0f36",
                    "size": 32999,
                    "url": "https://libraries.minecraft.net/net/minecraft/launchwrapper/1.12/launchwrapper-1.12.jar"
                }
            }
        });
        todasAsLibs.push({ "name": "optifine:OptiFine:1.8.9_HD_U_M5" });

        const jsonContent = {
            downloads: vanillaData.downloads,
            assetIndex: vanillaData.assetIndex,
            id: "1.8.9-OptiFine",
            jar: "1.8.9", 
            time: new Date().toISOString(),
            releaseTime: new Date().toISOString(),
            type: "release",
            mainClass: "net.minecraft.launchwrapper.Launch",
            minecraftArguments: "--username ${auth_player_name} --version ${version_name} --gameDir ${game_directory} --assetsDir ${assets_root} --assetIndex ${assets_index_name} --uuid ${auth_uuid} --accessToken ${auth_access_token} --userProperties ${user_properties} --tweakClass optifine.OptiFineTweaker",
            libraries: todasAsLibs
        };

        fs.writeFileSync(optiJsonPath, JSON.stringify(jsonContent, null, 4));
        return true; // Sucesso

    } catch (e) {
        console.error("[ERRO] Falha ao criar JSON:", e);
        return false;
    }
}

// --- JOGAR (LÓGICA PRINCIPAL) ---
ipcMain.on('iniciar-minecraft', async (evento, dados) => {
    
    const config = carregarConfig();
    
    // Tenta migrar o arquivo JAR se ele existir na pasta do projeto
    migrarOptiFineSeNecessario();

    // Lógica de Decisão: Base vs OptiFine
    let versaoParaJogar = {
        number: "1.8.9",
        type: "release"
    };

    // Tenta preparar o OptiFine. Se retornar 'true', significa que a base existe e o JSON foi criado.
    // Se retornar 'false', significa que a base não existe, então vamos baixar a 1.8.9 Vanilla primeiro.
    const optifinePronto = prepararJSONOptiFine();

    if (optifinePronto) {
        console.log("[Sistema] Base detectada. Iniciando com OptiFine...");
        versaoParaJogar = {
            number: "1.8.9-OptiFine",
            type: "release",
            custom: "1.8.9-OptiFine"
        };
        if (janelaPrincipal) janelaPrincipal.webContents.send('status-atualizacao', 'Iniciando Modificado...');
    } else {
        console.log("[Sistema] Primeira execução detectada. Baixando arquivos base...");
        if (janelaPrincipal) janelaPrincipal.webContents.send('status-atualizacao', 'Baixando Base (1ª Vez)...');
    }

    if (rpc) {
        const detalhes = optifinePronto ? 'Otimizado (OptiFine)' : 'Baixando Base';
        rpc.setActivity({ details: detalhes, state: 'YugenYumi Client', largeImageKey: 'logo', startTimestamp: Date.now() }).catch(() => { });
    }

    let customArgs = [];
    if (config.jvmArgs && config.jvmArgs.trim() !== "") customArgs = config.jvmArgs.split(' ');

    let opcoes = {
        authorization: dados.token,
        root: GAME_ROOT, // Nova pasta no AppData!
        version: versaoParaJogar,
        memory: { max: dados.ram + "G", min: "1G" },
        window: { width: parseInt(config.width) || 854, height: parseInt(config.height) || 480 },
        customArgs: customArgs,
        overrides: { detached: false }
    };

    if (dados.server) opcoes.server = { host: dados.server, port: "25565" };

    try {
        launcher.launch(opcoes).then((child) => {
            if (!child) return;
            console.log("[Sistema] Processo PID:", child.pid);
            if(optifinePronto) janelaPrincipal.webContents.send('status-atualizacao', 'Jogo rodando...');
            
            child.stdout.on('data', (data) => console.log('[MC]', data.toString()));
            child.stderr.on('data', (data) => console.log('[MC ERR]', data.toString()));

            child.on('close', (code) => {
                console.log("[Sistema] Jogo fechou com código:", code);
                if (janelaPrincipal && !janelaPrincipal.isDestroyed()) {
                    janelaPrincipal.webContents.send('jogo-fechou');
                }
            });
        });
    } catch (e) {
        console.log("Erro ao lançar:", e);
        if (janelaPrincipal) janelaPrincipal.webContents.send('jogo-fechou');
    }
});

// --- MONITOR DE DOWNLOAD ---
let lastStatusUpdate = 0;
launcher.on('progress', (e) => {
    const now = Date.now();
    if (now - lastStatusUpdate > 100 && janelaPrincipal && !janelaPrincipal.isDestroyed()) {
        lastStatusUpdate = now;
        if (e.type === 'assets' || e.type === 'natives') {
            janelaPrincipal.webContents.send('status-atualizacao', `Baixando Assets...`);
        } else if (e.type === 'classes') {
            janelaPrincipal.webContents.send('status-atualizacao', `Baixando Bibliotecas...`);
        } else {
            const porcentagem = Math.round((e.task / e.total) * 100);
            janelaPrincipal.webContents.send('status-atualizacao', `Baixando ${e.type}: ${porcentagem}%`);
        }
    }
});

// --- CONFIG EXTRA ---
ipcMain.handle('obter-config', async () => carregarConfig());
ipcMain.on('salvar-config-geral', (event, dados) => salvarConfig(dados));
ipcMain.on('salvar-ram', (event, valorRam) => salvarConfig({ ram: valorRam }));
ipcMain.on('toggle-mod', (event, { modId, estado }) => {
    const mods = carregarConfig().mods || {};
    mods[modId] = estado;
    salvarConfig({ mods });
});

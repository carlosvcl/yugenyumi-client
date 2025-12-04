const fs = require('fs');
const path = require('path');
const axios = require('axios');
const AdmZip = require('adm-zip');

// Link direto do Java 8 (64 bits) Portátil da Adoptium
const JAVA_URL = "https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u392-b08/OpenJDK8U-jre_x64_windows_hotspot_8u392b08.zip";

// Pasta onde o Java ficará salvo dentro do Launcher
const JAVA_DIR = path.join(__dirname, 'java-runtime');

async function verificarJava(janela) {
    // 1. Verifica se já temos o Java baixado
    const executavel = path.join(JAVA_DIR, 'jdk8u392-b08-jre', 'bin', 'java.exe');
    
    if (fs.existsSync(executavel)) {
        console.log("[JavaManager] Java portátil já existe. Pulando download.");
        return executavel;
    }

    // 2. Se não tiver, começa a baixar
    console.log("[JavaManager] Java não encontrado. Iniciando download...");
    
    // Avisa a janela (Front-end) que estamos baixando
    if(janela) janela.webContents.send('status-atualizacao', 'Baixando Java Portátil (Isso é feito apenas 1 vez)...');

    // Cria a pasta se não existir
    if (!fs.existsSync(JAVA_DIR)) fs.mkdirSync(JAVA_DIR);

    // Baixa o arquivo ZIP
    const caminhoZip = path.join(JAVA_DIR, 'java.zip');
    const writer = fs.createWriteStream(caminhoZip);

    const response = await axios({
        url: JAVA_URL,
        method: 'GET',
        responseType: 'stream'
    });

    response.data.pipe(writer);

    // Espera terminar o download
    await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });

    console.log("[JavaManager] Download concluído! Extraindo...");
    if(janela) janela.webContents.send('status-atualizacao', 'Instalando Java interno...');

    // 3. Extrai o ZIP
    const zip = new AdmZip(caminhoZip);
    zip.extractAllTo(JAVA_DIR, true);

    // Limpa o arquivo zip para economizar espaço
    fs.unlinkSync(caminhoZip);

    console.log("[JavaManager] Java instalado com sucesso!");
    return executavel;
}

module.exports = { verificarJava };
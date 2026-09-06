import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'assets', 'airlines');

const TARGET_SIZE = 256;

const files = fs.readdirSync(dir).filter(file => file.endsWith('.png'));

for (const file of files) {
  const filePath = path.join(dir, file);
  const tempPath = path.join(dir, `temp_${file}`);

  try {

    await sharp(filePath)
      .resize(TARGET_SIZE, TARGET_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(tempPath);

    fs.unlinkSync(filePath);
    fs.renameSync(tempPath, filePath);
    console.log(` Ajustado com sucesso: ${file}`);
  } catch (err) {
    console.error(`Erro ao processar ${file}:`, err.message);
  }
}

console.log('\nTodos os logótipos foram padronizados para formato 1:1!');
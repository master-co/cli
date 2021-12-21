import * as writeJson from 'writejson';
import * as os from 'os';

export async function saveConfig(config: any, filename: string = 'master-cli') {
    const homedir = os.homedir();
    await writeJson(`${homedir}/.${filename}.json`, config);
}

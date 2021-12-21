import * as readJson from 'readjson';
import * as writeJson from 'writejson';
import * as os from 'os';

export async function getConfig(filename: string = 'master-cli') {
    let config;
    const homedir = os.homedir();
    try {
        config = await readJson(`${homedir}/.${filename}.json`);
    } catch (ex) {
        config = {};
        await writeJson(`${homedir}/.${filename}.json`, config);
    }
    return config;
}
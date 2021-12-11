import { Command, flags } from '@oclif/command';
import { CommandResult, getMasterTextTemplateLanguage, runCommand } from '../utils';
import { exec } from 'child_process';
import { TextTemplate } from '@master/text-template';
import { promises as fs } from 'fs';
import * as Listr from 'listr';
import * as writeJson from 'write-json';
import * as readJson from 'readjson';
import * as path from 'path';
import * as inquirer from 'inquirer';

const prompt = inquirer.createPromptModule();

export default class Package extends Command {
    static description = 'master package'
    static aliases = ['p']
    static examples = [
        `$ m package new PACKAGE_NAME`,
        `$ m package new PACKAGE_NAME --css --org ORGANIZATION`,
        `$ m package new PACKAGE_NAME --util --user USERNAME`,
        `------`,
        `$ m package render README.md --data master.js`,
    ]

    static flags = {
        help: flags.help({ char: 'h', hidden: true }),

        // new
        model: flags.string({
            char: 'm',
            description: 'According to which model to build the package',
            options: ['standard', 'css', 'util', 'class']
        }),
        'gh-org': flags.string({
            description: 'Create github organization package',
            exclusive: ['gh-user']
        }),
        'gh-user': flags.string({
            description: 'Create github personal package',
            exclusive: ['gh-org']
        }),

        // render
        data: flags.string({
            description: 'According to what file to render',
            default: 'master.js'
        })
    }

    static args = [
        {
            name: 'action',
            required: true,
            options: ['new', 'n', 'render', 'r']
        },
        {
            name: 'name'
        }
    ]

    async run() {
        const { args, flags } = this.parse(Package);

        switch (args.action) {
            case 'new':
            case 'n':
                await this.new(args, flags);
                break;
            case 'render':
            case 'r':
                await this.render(args, flags);
                break;
        }
    }

    async new(args: any, flags: any) {

        // Check args.name
        if (!args.name) {
            throw new Error('Package name is required');
        }

        // Check github cli installed
        try {
            await runCommand('gh');
        } catch {
            throw new Error(`Require dependency of command "gh", please install Github CLI\n https://cli.github.com/`);
        }

        // questions part 1 - package basic info and github info
        const questionsPart1 = [];
        if (!flags.model) {
            questionsPart1.push({
                type: 'list',
                name: 'model',
                message: `What's your package model?`,
                choices: [
                    {
                        name: 'standard',
                        value: 'standard',
                    },
                    {
                        name: 'util (utility, function, etc.)',
                        value: 'util',
                    },
                    {
                        name: 'class (toolchain, engine, etc.)',
                        value: 'class',
                    },
                    {
                        name: 'css (style, theme, color, etc.)',
                        value: 'css',
                    },
                ],
            });
        }
        if (!flags['gh-org'] && !flags['gh-user']) {
            questionsPart1.push({
                type: 'list',
                name: 'kind',
                message: `What's kind of your package?`,
                choices: ['organization', 'personal'],
            });
            questionsPart1.push({
                type: 'input',
                name: 'org',
                message: 'Enter your organization name',
                default: 'master-style',
                when(answers) {
                    return answers.kind == 'organization';
                },
            });
            questionsPart1.push({
                type: 'input',
                name: 'user',
                message: 'Enter your username name',
                when(answers) {
                    return answers.kind == 'personal';
                },
            });
        }

        const answersPart1: any = await prompt(questionsPart1);

        // questions part 1 summary
        const model = answersPart1.model ? answersPart1.model : flags.model;
        const branch = (model === 'standard' || model === 'css') ? model : 'js'; // 若 model 為 'standard'、'css'，則 branch = model；若 model 為 'js'、'class'，則 branch = 'js'
        const kind = answersPart1.kind ? answersPart1.kind : (flags['gh-user'] ? 'personal' : 'organization');
        const accountName = answersPart1.user ? answersPart1.user : (answersPart1.org ? answersPart1.org : (flags['gh-user'] ? flags['gh-user'] : flags['gh-org']));
        if (model === 'util' || model === 'css') {
            args.name = `${args.name}.${model}`; // 為 PACKAGE_NAME 加上後綴
        }
        let defaultNpmPackageName = `@master/${args.name}`;

        // questions part 2 - npm package
        const questionsPart2 = [];
        questionsPart2.push({
            type: 'input',
            name: 'npmPackageName',
            message: 'npm package name',
            default: defaultNpmPackageName
        });
        questionsPart2.push({
            type: 'input',
            name: 'npmPackageLicense',
            message: 'npm package license',
            default: 'MIT'
        });
        const answersPart2: any = await prompt(questionsPart2);

        // questions part 2 summary
        const packageJson = {
            name: answersPart2.npmPackageName,
            license: answersPart2.npmPackageLicense,
            main: branch === 'css' ? 'index.css' : 'index.js',
            private: false,
            repository: {
                type: "git",
                url: `https://github.com/${accountName}/${args.name}.git`
            }
        }
        if (branch === 'js') {
            packageJson['types'] = 'index.d.ts';
        }

        // path
        const newPackagePath = path.join(process.cwd(), args.name);
        const masterJsFilePath = path.join(process.cwd(), args.name, 'master.js');
        const srcPackageJsonPath = path.join(process.cwd(), args.name, 'src', 'package.json');

        const tasks = new Listr([
            // Clone package
            {
                title: 'Clone package',
                task: () => runCommand(`git clone -b ${branch} https://github.com/master-style/package.git ${args.name}`, process.cwd()).then(result => {
                    if (result.code !== 0 && result.error.length > 0) {
                        throw new Error(result.error.join(''));
                    }
                })
            },
            // Reset package remote
            {
                title: 'Reset cloned to package origin',
                task: () => {
                    return new Listr([
                        // Remote remove origin
                        {
                            title: 'Remote remove origin',
                            task: (_, task) => runCommand(`git remote remove origin`, newPackagePath).then(result => {
                                if (result.code !== 0 && result.error.length > 0) {
                                    task.skip(result.error.join(''));
                                }
                            })
                        },
                        // Remote add package
                        {
                            title: 'Remote add package',
                            task: (_, task) => runCommand(`git remote add package https://github.com/master-style/package.git`, newPackagePath).then(result => {
                                if (result.error.length > 0) {
                                    task.skip(result.error.join(''));
                                }
                            })
                        }
                    ]);
                }
            },
            // Init package info files
            {
                title: 'Init package info files',
                task: () => {
                    return new Listr([
                        // Checkout to main
                        {
                            title: 'Checkout to main',
                            task: () => runCommand(`git checkout -b main`, newPackagePath).then(result => {
                                if (result.code !== 0 && result.error.length > 0) {
                                    throw new Error(result.error.join(''));
                                }
                            })
                        },
                        // Create src/package.json
                        {
                            title: 'Create src/package.json',
                            task: () => {
                                return new Promise<void>((resolve, reject) => {
                                    writeJson(srcPackageJsonPath, packageJson, err => {
                                        if (err) {
                                            reject(err);
                                        }
                                        resolve();
                                    });
                                })
                            }
                        },
                        // Git add
                        {
                            title: 'Git add',
                            task: () => runCommand(`git add src/package.json`, newPackagePath).then(result => {
                                if (result.code !== 0 && result.error.length > 0) {
                                    throw new Error(result.error.join(''));
                                }
                            })
                        },
                        // Update master.js
                        {
                            title: 'Update master.js',
                            task: async () => {
                                // read master.js
                                const originMasterJs = await fs.readFile(masterJsFilePath, 'utf8');

                                // render
                                const template = new TextTemplate(originMasterJs, { start: '{({', end: '})}' });
                                const data = {
                                    name: args.name,
                                    github: {
                                        repoName: args.name,
                                        name: accountName
                                    }
                                }
                                const result = template.render(data);

                                // write master.js
                                await fs.writeFile(masterJsFilePath, result);
                            }
                        },
                        // Git add
                        {
                            title: 'Git add',
                            task: () => runCommand(`git add master.js`, newPackagePath).then(result => {
                                if (result.code !== 0 && result.error.length > 0) {
                                    throw new Error(result.error.join(''));
                                }
                            })
                        },
                        // Update README.md
                        {
                            title: 'Update README.md',
                            task: () => runCommand('m p r', newPackagePath).then(result => {
                                if (result.code !== 0 && result.error.length > 0) {
                                    throw new Error(result.error.join(''));
                                }
                            })
                        },
                        // Git add
                        {
                            title: 'Git add',
                            task: () => runCommand(`git add README.md`, newPackagePath).then(result => {
                                if (result.code !== 0 && result.error.length > 0) {
                                    throw new Error(result.error.join(''));
                                }
                            })
                        },
                        // Git commit
                        {
                            title: 'Git commit',
                            task: () => runCommand(`git commit -m "Init package info files"`, newPackagePath).then(result => {
                                if (result.code !== 0 && result.error.length > 0) {
                                    throw new Error(result.error.join(''));
                                }
                            })
                        }
                    ]);
                }
            },
            // Create github repository with GitHub CLI
            {
                title: 'Create github repository with GitHub CLI',
                task: () => {
                    return new Listr([
                        // Check auth status
                        {
                            title: 'Check auth status',
                            task: (ctx, task) => runCommand('gh auth status').then(result => {
                                if (result.error.length > 0 && result.error[0].startsWith('You are not logged into any GitHub hosts')) {
                                    ctx.ghLogin = false;
                                    task.skip(result.error.join('\n'));
                                } else {
                                    ctx.ghLogin = true;
                                }
                            })
                        },
                        // Login
                        {
                            title: 'Login',
                            enabled: ctx => ctx.ghLogin === false,
                            task: (ctx, task) => (new Promise<CommandResult>(function (resolve, reject) {
                                const child = exec(`gh auth login -w`);

                                const result = [];
                                const error = [];
                                const codeRegex = /[A-Z0-9]{4}-[A-Z0-9]{4}/g;

                                child.stdout.on('data', (data: string) => {
                                    result.push(data);
                                    const match = data.match(codeRegex);
                                    if (match && match.length > 0) {
                                        task.output = `Your one-time code: ${match.pop()}`;
                                    }
                                });
                                child.stderr.on('data', data => {
                                    error.push(data);
                                    const match = data.match(codeRegex);
                                    if (match && match.length > 0) {
                                        task.output = `Your one-time code: ${match.pop()}`;
                                    }
                                });

                                child.stdin.end();
                                child.addListener('error', (err: Error) => reject(err));
                                child.addListener('exit', (code: number, signal: string) => resolve({ code, signal, result, error }));
                            })).then(result => {
                                if (result.code !== 0) {
                                    ctx.ghLogin = false;
                                    throw new Error(result.error.join(''));
                                } else {
                                    ctx.ghLogin = true;
                                }
                            })
                        },
                        // Create repository
                        {
                            title: 'Create repository',
                            task: (ctx, task) => {
                                if (kind === 'personal') {
                                    return runCommand(`gh repo create ${args.name} --public`)
                                        .then(result => {
                                            if (result.code !== 0 && result.error.length > 0) {
                                                ctx.ghRepoCreated = false;
                                                task.skip(result.error.join(''));
                                            } else {
                                                ctx.ghRepoCreated = true;
                                            }
                                        });
                                } else {
                                    return runCommand(`gh repo create ${accountName}/${args.name} --public`)
                                        .then(result => {
                                            if (result.code !== 0 && result.error.length > 0) {
                                                ctx.ghRepoCreated = false;
                                                task.skip(result.error.join(''));
                                            } else {
                                                ctx.ghRepoCreated = true;
                                            }
                                        });
                                }
                            }
                        },
                        // Remote add origin
                        {
                            title: 'Remote add origin',
                            skip: ctx => ctx.ghRepoCreated !== true,
                            task: (ctx, task) => runCommand(`git remote add origin https://github.com/${accountName}/${args.name}.git`, newPackagePath).then(result => {
                                if (result.code !== 0 && result.error.length > 0) {
                                    ctx.remoteAdded = false;
                                    task.skip(result.error.join(''));
                                } else {
                                    ctx.remoteAdded = true;
                                }
                            })
                        }
                    ]);
                }
            },
            // Push new package to github repository
            {
                title: 'Push new package to github repository',
                skip: ctx => ctx.remoteAdded !== true,
                task: (_, task) => runCommand(`git push origin main`, newPackagePath).then(result => {
                    if (result.code !== 0) {
                        task.skip(result.error.join(''));
                    }
                })
            }
        ]);

        await tasks.run();
    }

    async render(args: any, flags: any) {
        // Check data file ext
        const souceDataFileExt = path.extname(flags.data);
        if (souceDataFileExt !== '.js' && souceDataFileExt !== '.json') {
            throw new Error('Only support ".js" and ".json" files');
        }

        // Check target file
        if (!args.name) {
            args.name = 'README.md';
        }
        
        // load target file
        const targetFilePath = path.join(process.cwd(), args.name);
        const targetFileString = await fs.readFile(targetFilePath, 'utf8');
        const targetFileLanguage = getMasterTextTemplateLanguage(path.extname(args.name))

        // load package.json
        const srcPackageJsonPath = path.join(process.cwd(), 'src', 'package.json');
        const packageJsonData = await readJson(srcPackageJsonPath);
        
        // load source data
        const sourceDataFilePath = path.join(process.cwd(), flags.data);
        let roughSourceDataString = await fs.readFile(sourceDataFilePath, 'utf8');
        let roughSourceData;
        if (souceDataFileExt === '.js') {
            roughSourceData = eval(roughSourceDataString);
        } else {
            roughSourceData = JSON.parse(roughSourceDataString);
        }

        // render sourceData
        roughSourceData['package'] = packageJsonData;
        const roughTemplate = new TextTemplate(roughSourceDataString);
        const sourceDataString = roughTemplate.render(roughSourceData);

        let sourceData;
        if (souceDataFileExt === '.js') {
            sourceData = eval(sourceDataString);
        } else {
            sourceData = JSON.parse(sourceData);
        }
        // 在 sourceData 中加入 package.json 的資料
        sourceData['package'] = packageJsonData;

        // 以 sourceData render 目標檔案
        // render {{ }} 標記的部分
        const targetTemplate1 = new TextTemplate(targetFileString);
        const resultString1 = targetTemplate1.render(sourceData);
        // render 註解標記的部分
        const targetTemplate2 = new TextTemplate(resultString1, { behavior: 'slot', language: targetFileLanguage });
        const resultString2 = targetTemplate2.render(sourceData);

        // 寫回目標檔案
        await fs.writeFile(targetFilePath, resultString2);
    }
}

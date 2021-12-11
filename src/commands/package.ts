import { Command, flags } from '@oclif/command';
import { CommandResult, getMasterTextTemplateLanguage, runCommand } from '../utils';
import { TextTemplate } from '@master/text-template';
import { promises as fs } from 'fs';
import * as Listr from 'listr';
import * as writeJson from 'writejson';
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
        `$ m package render README.md --data master.json`,
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
            default: 'master.json'
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

        // check args.name
        if (!args.name) {
            throw new Error('Package name is required');
        }

        // check github cli installed
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
        const configFilePath = path.join(process.cwd(), args.name, 'master.json');
        const srcPackageJsonPath = path.join(process.cwd(), args.name, 'src', 'package.json');

        const tasks = new Listr([
            // Clone package
            {
                title: 'Clone package',
                task: async () => {
                    const result = await runCommand(`git clone -b ${branch} https://github.com/master-style/package.git ${args.name}`, process.cwd());
                    if (result.code !== 0) {
                        throw new Error(result.err.join(''));
                    }
                }
            },
            // Reset package remote
            {
                title: 'Reset cloned to package origin',
                task: () => {
                    return new Listr([
                        // Remote remove origin
                        {
                            title: 'Remote remove origin',
                            task: async (_, task) => {
                                const result = await runCommand(`git remote remove origin`, newPackagePath);
                                if (result.code !== 0) {
                                    task.skip(result.err.join(''));
                                }
                            }
                        },
                        // Remote add package
                        {
                            title: 'Remote add package',
                            task: async (_, task) => {
                                const result = await runCommand(`git remote add package https://github.com/master-style/package.git`, newPackagePath);
                                if (result.err.length > 0) {
                                    task.skip(result.err.join(''));
                                }
                            }
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
                            task: async () => {
                                const result = await runCommand(`git checkout -b main`, newPackagePath);
                                if (result.code !== 0) {
                                    throw new Error(result.err.join(''));
                                }
                            }
                        },
                        // Create src/package.json
                        {
                            title: 'Create src/package.json',
                            task: () => writeJson(srcPackageJsonPath, packageJson)
                        },
                        // Git add
                        {
                            title: 'Git add',
                            task: async () => {
                                const result = await runCommand(`git add src/package.json`, newPackagePath);
                                if (result.code !== 0) {
                                    throw new Error(result.err.join(''));
                                }
                            }
                        },
                        // Update master.json
                        {
                            title: 'Update master.json',
                            task: async () => {
                                const config = await readJson(configFilePath);
                                config.name = args.name;
                                config.github = {
                                    repoName: args.name,
                                    name: accountName
                                };
                                await writeJson(configFilePath, config);
                            }
                        },
                        // Git add
                        {
                            title: 'Git add',
                            task: async () => {
                                const result = await runCommand(`git add master.json`, newPackagePath);
                                if (result.code !== 0) {
                                    throw new Error(result.err.join(''));
                                }
                            }
                        },
                        // Update README.md
                        {
                            title: 'Update README.md',
                            task: async () => {
                                const result = await runCommand('m p r', newPackagePath);
                                if (result.code !== 0) {
                                    throw new Error(result.err.join(''));
                                }
                            }
                        },
                        // Git add
                        {
                            title: 'Git add',
                            task: async () => {
                                const result = await runCommand(`git add README.md`, newPackagePath);
                                if (result.code !== 0) {
                                    throw new Error(result.err.join(''));
                                }
                            }
                        },
                        // Git commit
                        {
                            title: 'Git commit',
                            task: async () => {
                                const result = await runCommand(`git commit -m "Init package info files"`, newPackagePath);
                                if (result.code !== 0) {
                                    throw new Error(result.err.join(''));
                                }
                            }
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
                            task: async (ctx, task) => {
                                const result = await runCommand('gh auth status');
                                if (result.err.length > 0 && result.err[0].startsWith('You are not logged into any GitHub hosts')) {
                                    ctx.ghLogin = false;
                                    task.skip(result.err.join('\n'));
                                } else {
                                    ctx.ghLogin = true;
                                }
                            }
                        },
                        // Login
                        {
                            title: 'Login',
                            enabled: ctx => ctx.ghLogin === false,
                            task: async (ctx, task) => {
                                const checkAndPrintCode = (data) => {
                                    const match = data.match(/[A-Z0-9]{4}-[A-Z0-9]{4}/g);
                                    if (match && match.length > 0) {
                                        task.output = `Your one-time code: ${match.pop()}`;
                                    }
                                }
                                const result = await runCommand(`gh auth login -w`, null, checkAndPrintCode, checkAndPrintCode);
                                if (result.code !== 0) {
                                    ctx.ghLogin = false;
                                    throw new Error(result.err.join(''));
                                } else {
                                    ctx.ghLogin = true;
                                }
                            }
                        },
                        // Create repository
                        {
                            title: 'Create repository',
                            task: async (ctx, task) => {
                                let result: CommandResult;
                                if (kind === 'personal') {
                                    result = await runCommand(`gh repo create ${args.name} --public`);
                                } else {
                                    result = await runCommand(`gh repo create ${accountName}/${args.name} --public`);
                                }
                                if (result.code !== 0) {
                                    ctx.ghRepoCreated = false;
                                    task.skip(result.err.join(''));
                                } else {
                                    ctx.ghRepoCreated = true;
                                }
                            }
                        },
                        // Remote add origin
                        {
                            title: 'Remote add origin',
                            skip: ctx => ctx.ghRepoCreated !== true,
                            task: async (ctx, task) => {
                                const result = await runCommand(`git remote add origin https://github.com/${accountName}/${args.name}.git`, newPackagePath);
                                if (result.code !== 0) {
                                    ctx.remoteAdded = false;
                                    task.skip(result.err.join(''));
                                } else {
                                    ctx.remoteAdded = true;
                                }
                            }
                        }
                    ]);
                }
            },
            // Push new package to github repository
            {
                title: 'Push new package to github repository',
                skip: ctx => ctx.remoteAdded !== true,
                task: async (_, task) => {
                    const result = await runCommand(`git push origin main`, newPackagePath);
                    if (result.code !== 0) {
                        task.skip(result.err.join(''));
                    }
                }
            }
        ]);

        await tasks.run();
    }

    async render(args: any, flags: any) {
        // check data file ext
        const souceDataFileExt = path.extname(flags.data);
        if (souceDataFileExt !== '.js' && souceDataFileExt !== '.json') {
            throw new Error('Only support ".js" and ".json" files');
        }

        // check target file
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
        let sourceDataString = await fs.readFile(sourceDataFilePath, 'utf8');
        let sourceData;
        if (souceDataFileExt === '.js') {
            sourceData = eval(sourceDataString);
        } else {
            sourceData = JSON.parse(sourceDataString);
        }

        // add package.json data to sourceData
        sourceData['package'] = packageJsonData;

        const targetTemplate1 = new TextTemplate(targetFileString, { behavior: 'slot', language: targetFileLanguage });
        const resultString1 = targetTemplate1.render(sourceData);
        const targetTemplate2 = new TextTemplate(resultString1);
        const resultString2 = targetTemplate2.render(sourceData);

        await fs.writeFile(targetFilePath, resultString2);
    }
}

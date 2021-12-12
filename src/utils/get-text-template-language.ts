export function getTextTemplateLanguage(fileExt: string) {
    switch (fileExt) {
        case '.hs':
        case '.lhs':
            return 'haskell';
        case '.fs':
        case '.fth':
        case '.forth':
            return 'forth';
        case '.pp':
            return 'pascal';
        case '.html':
        case '.htm':
            return 'html';
        case '.md':
            return 'readme';
        default:
            return '';
    }
}

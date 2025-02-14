export type Language = 'ko' | 'en'

export const translations: Record<Language, Record<string, string>> = {
	ko: {
		INVALID_FILE_NAME: '파일 이름에 허용되지 않는 문자가 포함되어 있습니다.',
		ERROR_WHILE_CHANGE_NAME: '파일 이름 벼경 중 오류가 발생했습니다',
		PATTERN_ENDS_WITH_UNDERSCORE: '*_ (끝에 _가 있는 경우)',
		PATTERN_STARTS_WITH_UNDERSCORE: '_* (앞에 _가 있는 경우)',
		PATTERN_ENCLOSED_IN_DOUBLE_UNDERSCORE: '*__* (앞뒤에 __가 있는 경우)',
		PATTERN_ENCLOSED_IN_DASH: '*--* (앞뒤에 --가 있는 경우)',
		PATTERN_ENCLOSED_IN_TILDE: '*~~* (앞뒤에 ~~가 있는 경우)',
	},
	en: {
		INVALID_FILE_NAME: 'The file name contains invalid characters.',
		PATTERN_ENDS_WITH_UNDERSCORE: '*_ (files ending with _)',
		PATTERN_STARTS_WITH_UNDERSCORE: '_* (files starting with _)',
		PATTERN_ENCLOSED_IN_DOUBLE_UNDERSCORE: '*__* (files enclosed with __)',
		PATTERN_ENCLOSED_IN_DASH: '*--* (files enclosed with --)',
		PATTERN_ENCLOSED_IN_TILDE: '*~~* (files enclosed with ~~)'
	}
}

export let currentLanguage: Language = 'ko'

export function t(key: string): string {
	return translations[currentLanguage][key] || key
}

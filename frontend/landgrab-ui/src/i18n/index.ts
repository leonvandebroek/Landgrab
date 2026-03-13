import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';
import nl from './nl';

// Detect browser language; fall back to English if not Dutch.
const browserLang = navigator.language ?? '';
const lng = browserLang.startsWith('nl') ? 'nl' : 'en';

i18n
  .use(initReactI18next)
  .init({
    lng,
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      nl: { translation: nl },
    },
    interpolation: {
      // React already escapes values.
      escapeValue: false,
    },
  });

export default i18n;

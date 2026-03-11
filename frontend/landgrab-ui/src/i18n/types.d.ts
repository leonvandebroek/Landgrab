import en from './en';

// Augment i18next so t() calls are type-checked against the English translations.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof en;
    };
  }
}

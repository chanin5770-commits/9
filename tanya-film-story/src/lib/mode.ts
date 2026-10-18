// שתי גרסאות של הסרט: עם כתוביות לקריינות (Film) ונקייה, בלי כתוביות (FilmClean).
import { createContext, useContext } from 'react';

export const CaptionsContext = createContext(true);
export const useCaptions = () => useContext(CaptionsContext);

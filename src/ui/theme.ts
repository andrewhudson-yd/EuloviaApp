/** Shared Eulovia palette, with darker plum and bronze for legible text and controls. */
export const colours = {
    ivory: '#F8F5EF',
    surface: '#FFFDF9',
    sage: '#614C61',
    sageDark: '#403C4A',
    sageTint: '#F1EBF3',
    mutedSage: '#A8B7A1',
    lavender: '#D7CDE1',
    stone: '#B58D6A',
    stoneInk: '#6B5A47',
    line: '#E7E2DA',
    charcoal: '#403C4A',
    muted: '#625B62',
    attention: '#9B2C2C',
    attentionTint: '#FBEAEA',
    waiting: '#8A5A00',
    waitingTint: '#FFF4DD',
    positive: '#3F513C',
    recording: '#B3261E',
};

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };

export const font = { display: 'DMSerifDisplay_400Regular', body: 'Inter_400Regular', semibold: 'Inter_600SemiBold' };

export const type = {
    title: { fontFamily: font.display, fontSize: 32, lineHeight: 39, letterSpacing: -0.5, color: colours.charcoal },
    heading: { fontFamily: font.display, fontSize: 20, lineHeight: 25, color: colours.charcoal },
    body: { fontFamily: font.body, fontSize: 16, lineHeight: 25, color: colours.charcoal },
    small: { fontFamily: font.body, fontSize: 13, lineHeight: 20, color: colours.muted },
};

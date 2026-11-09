/** Same palette as the web app: ivory, sage, stone, charcoal. */
export const colours = {
    ivory: '#F8F6F2',
    surface: '#FFFDF9',
    sage: '#344F49',
    sageDark: '#26403A',
    sageTint: '#EAF0EE',
    stone: '#B5A18B',
    stoneInk: '#75634F',
    line: '#E7E2DA',
    charcoal: '#292B2A',
    muted: '#5E625F',
    attention: '#9B2C2C',
    attentionTint: '#FBEAEA',
    waiting: '#8A5A00',
    waitingTint: '#FFF4DD',
    positive: '#2F6B3F',
    recording: '#B3261E',
};

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };

export const type = {
    title: { fontSize: 30, lineHeight: 38, letterSpacing: -0.8, fontWeight: '600' as const, color: colours.charcoal },
    heading: { fontSize: 18, fontWeight: '600' as const, color: colours.charcoal },
    body: { fontSize: 16, lineHeight: 25, color: colours.charcoal },
    small: { fontSize: 13, lineHeight: 20, color: colours.muted },
};

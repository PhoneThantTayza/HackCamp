// The page engine validates values again before turning them into CSS.
export const emptyDyslexia = () => ({ experiences: {}, customization: {} });
export function restoreDyslexia(saved) {
  const value = saved?.dyslexia;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const experiences = { ...value.experiences }, customization = { ...value.customization };
    // Retired reading-color settings must not reappear when old preferences load.
    delete experiences.visualStress;
    delete customization.background;
    delete customization.textColor;
    return { ...value, experiences, customization };
  }
  // Preserve old individual choices as explicit settings, rather than guessing experiences.
  const customization = {};
  for (const choice of saved?.selected ?? []) {
    if (choice === 'dyslexia:Readable font') customization.font = 'sans';
    if (choice === 'dyslexia:Wider letter spacing') Object.assign(customization, { letterSpacing: 0.08, wordSpacing: 0.12 });
    if (choice === 'dyslexia:Shorter lines') customization.lineLength = 65;
    if (choice === 'dyslexia:Left-aligned text') customization.alignStart = true;
    if (choice === 'dyslexia:Reading guide') customization.guide = true;
  }
  return { experiences: {}, customization };
}
export function dyslexiaChoiceCount(value) {
  return Object.values(value.experiences).filter(item => item === true).length +
    (Object.keys(value.customization).length > 0 ? 1 : 0);
}

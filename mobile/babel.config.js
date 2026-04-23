module.exports = function (api) {
  api.cache(true);

  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }]],
    plugins: ['expo-router/babel', 'react-native-reanimated/plugin'],
  };
};

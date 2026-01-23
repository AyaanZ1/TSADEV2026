import React from 'react';
import { SafeAreaView, StatusBar } from 'react-native';
import { Dashboard } from './src/components/Dashboard';

const App = () => {
  return (
    <>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <Dashboard />
    </>
  );
};

export default App;

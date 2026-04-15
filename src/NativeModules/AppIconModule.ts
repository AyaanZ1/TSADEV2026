import {NativeModules, Platform} from 'react-native';

const {AppIconModule} = NativeModules;

export type AppIconName = 'default' | 'AppIconDark';

const AppIcon = {
  setIcon: (iconName: AppIconName): Promise<void> => {
    if (Platform.OS !== 'ios') {
      return Promise.resolve();
    }

    return AppIconModule.setIcon(iconName === 'default' ? null : iconName);
  },

  getIcon: (): Promise<AppIconName> => {
    if (Platform.OS !== 'ios') {
      return Promise.resolve('default');
    }

    return AppIconModule.getIcon();
  },
};

export default AppIcon;

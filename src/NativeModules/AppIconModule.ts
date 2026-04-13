import { NativeModules, Platform } from 'react-native';

const { AppIconModule } = NativeModules;

export type AppIconName = 'default' | 'AppIconDark';

const AppIcon = {
    /** Set the app icon. Pass 'default' for the light icon, 'AppIconDark' for the dark icon. */
    setIcon: (iconName: AppIconName): Promise<void> => {
        if (Platform.OS !== 'ios') return Promise.resolve();
        return AppIconModule.setIcon(iconName === 'default' ? null : iconName);
    },

    /** Returns the current icon name ('default' if using the primary icon). */
    getIcon: (): Promise<AppIconName> => {
        if (Platform.OS !== 'ios') return Promise.resolve('default');
        return AppIconModule.getIcon();
    },
};

export default AppIcon;

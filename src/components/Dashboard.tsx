import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Animated, Easing, Modal, Switch, LayoutAnimation, Platform, UIManager, Vibration } from 'react-native';
import { AudioService } from '../services/AudioService';
import { HapticEngine } from '../services/HapticEngine';
import LinearGradient from 'react-native-linear-gradient';
import { BlurView } from '@react-native-community/blur';

const { width, height } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const GlowingOrb = ({ isListening, frequency }: { isListening: boolean; frequency: number }) => {
    // Basic scaling based on frequency
    const scale = isListening ? 1 + Math.min(frequency / 1000, 0.5) : 1;
    // Basic color shift based on frequency
    const glowColor = frequency < 200 ? '#8b5cf6' : (frequency < 800 ? '#3b82f6' : '#06b6d4'); // Violet -> Blue -> Cyan

    return (
        <View style={styles.orbContainer}>
            {/* Outer Glow Layers (Simulating Wave) */}
            {isListening && (
                <>
                    <View style={[styles.orbRing, { width: 300, height: 300, borderColor: glowColor, opacity: 0.1 * scale, transform: [{ scale: 1.2 }] }]} />
                    <View style={[styles.orbRing, { width: 280, height: 280, borderColor: glowColor, opacity: 0.2 * scale, transform: [{ scale: 1.1 }] }]} />
                    <View style={[styles.orbRing, { width: 260, height: 260, borderColor: glowColor, opacity: 0.3 * scale }]} />
                </>
            )}

            {/* Core Orb */}
            <LinearGradient
                colors={isListening ? [glowColor, '#1e1b4b'] : ['#a5b4fc', '#1e1b4b']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                    styles.orbCore,
                    {
                        transform: [{ scale: isListening ? scale : 1 }],
                        shadowColor: glowColor
                    }
                ]}
            />
        </View>
    );
};

// Settings Modal Component
const SettingsModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
    const [hapticEnabled, setHapticEnabled] = useState(true);
    const [highContrast, setHighContrast] = useState(false);

    // Update HapticEngine when toggle changes
    useEffect(() => {
        HapticEngine.setEnabled(hapticEnabled);
    }, [hapticEnabled]);

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <BlurView
                    style={styles.modalContent}
                    blurType="dark"
                    blurAmount={25}
                    reducedTransparencyFallbackColor="#0f172a"
                >
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Settings</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Text style={styles.closeButtonText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>Haptic Feedback</Text>
                        <Switch
                            value={hapticEnabled}
                            onValueChange={setHapticEnabled}
                            trackColor={{ false: '#767577', true: '#30D158' }}
                            thumbColor={'#f4f3f4'}
                        />
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>High Contrast</Text>
                        <Switch
                            value={highContrast}
                            onValueChange={setHighContrast}
                            trackColor={{ false: '#767577', true: '#30D158' }}
                            thumbColor={'#f4f3f4'}
                        />
                    </View>

                    <View style={styles.settingRow}>
                        <Text style={styles.settingLabel}>App Version</Text>
                        <Text style={styles.settingValue}>1.0.0 (TSA Build)</Text>
                    </View>
                </BlurView>
            </View>
        </Modal>
    );
};

export const Dashboard = () => {
    const [isListening, setIsListening] = useState(false);
    const [currentFreq, setCurrentFreq] = useState(0);
    const [showSettings, setShowSettings] = useState(false);

    useEffect(() => {
        const listener = AudioService.addListener((data) => {
            if (isListening) {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setCurrentFreq(data.frequency);
                HapticEngine.processFrequency(data.frequency);
            }
        });

        return () => {
            listener.remove();
            AudioService.stop();
        };
    }, [isListening]);

    const toggleListen = () => {
        // Trigger haptic on press
        Vibration.vibrate(10);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);

        if (isListening) {
            AudioService.stop();
        } else {
            AudioService.start();
        }
        setIsListening(!isListening);
    };

    return (
        <LinearGradient
            colors={['#020617', '#1e1b4b', '#0f172a']} // Deep Black/Blue/Purple
            locations={[0, 0.5, 1]}
            style={styles.container}
        >
            <SettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />

            {/* Header Card */}
            <BlurView
                style={styles.glassHeader}
                blurType="dark"
                blurAmount={20}
                reducedTransparencyFallbackColor="#0f172a"
            >
                <View style={styles.headerRow}>
                    <Text style={styles.headerText}>RESONATE</Text>
                    <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsButton}>
                        <View style={styles.settingsIcon} />
                    </TouchableOpacity>
                </View>
                <Text style={styles.subHeaderText}>Presented By Team 21857-1</Text>
                <Text style={styles.subHeaderText}>Washington TSA 2026</Text>
            </BlurView>

            {/* Central Visualizer */}
            <View style={styles.visualizerContainer}>
                {/* Instruction Text Moved Down and styled to not overlap */}
                <Text style={[styles.instructionText, { opacity: isListening ? 0.6 : 1 }]}>
                    {isListening ? 'Listening to audio...' : 'Tap microphone to start'}
                </Text>
                <GlowingOrb isListening={isListening} frequency={currentFreq} />
            </View>

            {/* Bottom Controls */}
            <View style={styles.bottomControls}>
                <View style={styles.dataCard}>
                    <Text style={styles.dataLabel}>FREQUENCY</Text>
                    <Text style={styles.dataValue}>
                        {isListening ? `${currentFreq.toFixed(0)} Hz` : '--'}
                    </Text>
                </View>

                <TouchableOpacity
                    style={styles.micButtonWrapper}
                    onPress={toggleListen}
                    activeOpacity={0.8}
                >
                    <LinearGradient
                        // Green when active, Blue when inactive
                        colors={isListening ? ['#4ade80', '#22c55e'] : ['#3b82f6', '#1d4ed8']}
                        style={styles.micButton}
                    >
                        <View style={[styles.micIcon, { backgroundColor: isListening ? '#ffffff' : '#ffffff' }]} />
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'space-between',
        paddingVertical: 60,
        paddingHorizontal: 20,
    },
    glassHeader: {
        width: '100%',
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        padding: 24,
        zIndex: 10, // Ensure header is above other elements
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    headerText: {
        color: '#FFFFFF',
        fontSize: 24,
        fontWeight: '700',
        letterSpacing: 1,
        fontFamily: 'System',
    },
    settingsButton: {
        padding: 8,
    },
    settingsIcon: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.8)',
        shadowColor: 'white',
        shadowOpacity: 0.5,
        shadowRadius: 4,
    },
    subHeaderText: {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: 13,
        fontWeight: '500',
        marginTop: 2,
    },
    visualizerContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        position: 'relative',
        marginTop: 20, // Add spacing from header
    },
    instructionText: {
        position: 'absolute',
        top: 20, // Moved down from negative top to positive relative to container
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 14,
        letterSpacing: 0.5,
        textAlign: 'center',
        width: '100%',
        zIndex: 5,
    },
    orbContainer: {
        width: 300,
        height: 300,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 40, // Push orb down slightly to make room for text
    },
    orbCore: {
        width: 180,
        height: 180,
        borderRadius: 90,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 40,
        elevation: 20,
        backgroundColor: 'transparent', // Fix shadow warning for LinearGradient parent View
    },
    orbRing: {
        position: 'absolute',
        borderRadius: 150, // Max radius
        borderWidth: 1,
    },
    bottomControls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 10,
        marginBottom: 20,
    },
    dataCard: {
        justifyContent: 'center',
    },
    dataLabel: {
        color: 'rgba(255, 255, 255, 0.4)',
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 1,
        marginBottom: 4,
    },
    dataValue: {
        color: '#FFFFFF',
        fontSize: 28,
        fontWeight: '300',
        fontVariant: ['tabular-nums'],
    },
    micButtonWrapper: {
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        backgroundColor: 'transparent', // Fix shadow warning
    },
    micButton: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    micIcon: {
        width: 20,
        height: 30,
        borderRadius: 10,
        backgroundColor: '#FFFFFF',
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '85%',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        padding: 24,
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: 'white',
    },
    closeButton: {
        padding: 8,
    },
    closeButtonText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 20,
        fontWeight: 'bold',
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    settingLabel: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.8)',
    },
    settingValue: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.4)',
    }
});

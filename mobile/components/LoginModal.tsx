import { Modal } from 'react-native';
import { LoginScreen } from '@/components/LoginScreen';

interface LoginModalProps {
    visible: boolean;
    onComplete: () => void;
}

export function LoginModal({ visible, onComplete }: LoginModalProps) {
    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={onComplete}
        >
            <LoginScreen onComplete={onComplete} />
        </Modal>
    );
}

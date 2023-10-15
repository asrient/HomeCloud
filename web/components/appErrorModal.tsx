import React, { useEffect, useState } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useAppState } from './hooks/useAppState';

const AppErrorModal = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { appError, isInitalized } = useAppState();

    useEffect(() => {
        setIsOpen(isInitalized && !!appError);
    }, [appError, isInitalized]);

    const preventDefault = (e: any) => e.preventDefault();

    const refresh = () => {
        location.reload();
    };

    return (
        <AlertDialog open={isOpen}>
            <AlertDialogContent onEscapeKeyDown={preventDefault}>
                <AlertDialogHeader>
                    <AlertDialogTitle>We ran into some problems..</AlertDialogTitle>
                    <AlertDialogDescription>
                        <span className='text-red-500'>{appError}</span>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogAction onClick={refresh}>Refresh Page</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>);
};

export default AppErrorModal;

import React, { useCallback, useEffect } from 'react';
import { Storage, StorageAuthType, StorageAuthTypes, StorageType } from '@/lib/types';
import { getName, getOneAuthButtonConfig, isOneAuthSupported, getSupportedAuthTypes, getAuthTypeName, StorageTypeConfig } from '@/lib/storageConfig';
import { Button } from './ui/button';
import { openExternalLink } from '@/lib/utils';
import { AddStorageParams, addStorage, storageCallback, EditStorageParams, editStorage } from '@/lib/api/storage';
import { useAppState } from './hooks/useAppState';
import { Input } from './ui/input';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormRootError,
    errorToFormError,
} from "@/components/ui/form";
import { useForm, useWatch } from 'react-hook-form';
import * as z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import LoadingIcon from './ui/loadingIcon';

function OneAuthButton({
    storageType,
    onClick,
    isLoading,
}: {
    storageType: StorageType;
    onClick: () => void;
    isLoading?: boolean;
}) {
    const buttonConfig = getOneAuthButtonConfig(storageType);
    const styles = buttonConfig.styles || {};

    return (<Button disabled={!!isLoading} size='lg' style={styles} onClick={onClick}>
        {
            isLoading 
            ? (<LoadingIcon className='w-4 h-4' />)
            : buttonConfig.text
        }
    </Button>)
}

function useSuggestedName(storageType: StorageType) {
    const { storages } = useAppState();
    const [suggestedName, setSuggestedName] = React.useState<string>(getName(storageType));
    React.useEffect(() => {
        if (!storages) return;
        const count = storages.filter(s => s.type === storageType).length;
        setSuggestedName(`${getName(storageType)} ${count + 1}`);
    }, [storages, storageType]);
    return suggestedName;
}

function OneAuthForm({
    storageType,
    onCancel,
    onSuccess,
    existingStorage
}: {
    storageType: StorageType;
    onCancel: () => void;
    onSuccess: (params: Storage) => void;
    existingStorage?: Storage;
}) {
    const [error, setError] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [manualCode, setManualCode] = React.useState<string | null>(null);
    const [redirect, setRedirect] = React.useState<{
        redirectUrl: string;
        referenceId: string;
    } | null>(null);
    const suggestedName = useSuggestedName(storageType);

    const onContinue = useCallback(async () => {
        const name = existingStorage?.name || suggestedName;
        if (isLoading) {
            return;
        }
        setError(null);
        setManualCode(null);
        try {
            setIsLoading(true);
            const resp = await addStorage({
                type: storageType,
                authType: StorageAuthType.OneAuth,
                name,
            } as AddStorageParams);
            if (resp && resp.authUrl && resp.pendingAuth?.referenceId) {
                setRedirect({
                    redirectUrl: resp.authUrl,
                    referenceId: resp.pendingAuth?.referenceId,
                });
                openExternalLink(resp.authUrl);
            } else {
                throw new Error('Invalid response: missing authUrl or referenceId');
            }
        } catch (e: any) {
            console.error(e);
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    }, [existingStorage?.name, isLoading, storageType, suggestedName]);

    const onPreferManual = useCallback(() => {
        setManualCode('');
    }, []);

    const onManualCodeSubmit = useCallback(async () => {
        if (!manualCode) return;
        const params = {
            referenceId: redirect!.referenceId,
            partialCode2: manualCode,
        };
        setError(null);
        try {
            setIsLoading(true);
            const resp = await storageCallback(params);
            if (resp && resp.storage) {
                onSuccess(resp.storage);
            } else {
                throw new Error('Invalid response: missing storage');
            }
        } catch (e: any) {
            console.error(e);
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    }, [manualCode, redirect, onSuccess]);

    return (<div className='flex flex-col justify-center'>
        <div className='text-lg font-medium'>
            {
                redirect ? 'Redirecting..' : 'Sign In'
            }
        </div>
        <div className='text-sm text-slate-500 font-medium'>
            {
                redirect ? 'Open the link in browser' : `You will be redirected to ${storageType} to authorize HomeCloud.`
            }
        </div>
        {
            redirect && <div className='text-xs text-blue-600'>
                {redirect.redirectUrl}
            </div>
        }
        <div className='p-1'>
            {error && <div className='text-red-500 text-xs'>{error}</div>}
        </div>
        <div className='p-1'>
            {
                redirect && manualCode === null && <Button variant='ghost' className='text-blue-500' onClick={onPreferManual}>Enter code manually</Button>
            }
            {
                manualCode !== null &&
                <Input placeholder='Enter code' value={manualCode} onChange={(e) => setManualCode(e.target.value)} />
            }
        </div>
        <div  className='flex justify-center items-center space-x-2 pt-3'>
            {
                redirect
                    ? (
                        !manualCode
                            ? <Button variant='outline' size='lg' onClick={() => openExternalLink(redirect.redirectUrl)}>Open in browser</Button>
                            : <Button disabled={isLoading} variant='default' size='lg' onClick={onManualCodeSubmit}>Continue</Button>
                    )
                    : <OneAuthButton storageType={storageType} isLoading={isLoading} onClick={onContinue} />
            }
            <Button variant='secondary' size='lg' onClick={onCancel}>Cancel</Button>
        </div>
    </div>)
}

const storageFormSchema = z.object({
    name: z.string().min(2).max(50),
    url: z.string().min(1).max(50),
    authType: z.string().refine((v) => StorageAuthTypes.includes(v as StorageAuthType)),
    username: z.string().max(50),
    secret: z.string().max(50),
});

function StorageFormManual({
    storageType,
    onCancel,
    onSuccess,
    existingStorage
}: {
    storageType: StorageType;
    onCancel: () => void;
    onSuccess: (params: Storage) => void;
    existingStorage?: Storage;
}) {
    const suggestedName = useSuggestedName(storageType);

    const form = useForm<z.infer<typeof storageFormSchema>>({
        resolver: zodResolver(storageFormSchema),
        defaultValues: {
            name: existingStorage?.name || suggestedName,
            url: existingStorage?.url || '',
            authType: existingStorage?.authType || StorageTypeConfig[storageType].authTypes[0],
            username: existingStorage?.username || '',
            secret: '',
        },
    });

    const selectedAuthType = useWatch({
        control: form.control,
        name: "authType",
    });

    const allowAuthTypes = getSupportedAuthTypes(storageType);

    useEffect(() => {
        if (selectedAuthType === StorageAuthType.None) {
            form.setValue('username', '');
            form.setValue('secret', '');
        }
    }, [form, selectedAuthType]);

    useEffect(() => {
        if (!form.getFieldState('name')?.isDirty && !existingStorage) {
            form.setValue('name', suggestedName);
        }
    }, [existingStorage, form, suggestedName]);

    function onFormSubmit(values: z.infer<typeof storageFormSchema>) {
        // This will be type-safe and validated.
        console.log(values);
        if (!!existingStorage) {
            const params: EditStorageParams = {
                storageId: existingStorage.id,
            };
            if (values.name !== existingStorage.name) {
                params.name = values.name;
            }
            if (values.url !== existingStorage.url) {
                params.url = values.url;
            }
            if (values.authType !== existingStorage.authType) {
                params.authType = values.authType as StorageAuthType;
            }
            if (values.username !== existingStorage.username) {
                params.username = values.username;
            }
            if (values.secret.length > 0) {
                params.secret = values.secret;
            }
            performEditStorage(params);
            return;
        }
        const params: AddStorageParams = {
            name: values.name,
            type: storageType,
            authType: values.authType as StorageAuthType,
            url: values.url,
            username: values.username,
            secret: values.secret,
        };
        performAddStorage(params);
    }

    const performEditStorage = useCallback(async (params: EditStorageParams) => {
        try {
            const resp = await editStorage(params);
            if (resp && resp.storage) {
                onSuccess(resp.storage);
            } else {
                throw new Error('Invalid response: missing storage');
            }
        } catch (error: any) {
            console.error(error);
            errorToFormError(error, form);
            return;
        }
    }, [form, onSuccess]);

    const performAddStorage = useCallback(async (params: AddStorageParams) => {
        try {
            const resp = await addStorage(params);
            if (resp && resp.storage) {
                onSuccess(resp.storage);
            } else {
                throw new Error('Invalid response: missing storage');
            }
        } catch (error: any) {
            console.error(error);
            errorToFormError(error, form);
            return;
        }
    }, [form, onSuccess]);

    const showCredFields = selectedAuthType !== StorageAuthType.None;
    const hasPreviousPassword = existingStorage && existingStorage.authType !== StorageAuthType.None;

    return (<Form {...form}>
        <FormMessage />
        <FormRootError />
        <form onSubmit={form.handleSubmit(onFormSubmit)} className="space-y-5">
            <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                            <Input placeholder={`My ${getName(storageType)}`} {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
            {
                StorageTypeConfig[storageType].urlRequired && (
                    <FormField
                    control={form.control}
                    name="url"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Server URL</FormLabel>
                            <FormControl>
                                <Input placeholder="https://example.com" {...field} />
                            </FormControl>
                            <FormDescription>
                                The URL of the {getName(storageType)} server.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                )
            }
            <FormField
                control={form.control}
                name="authType"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Authentication Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select authentication" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {
                                    allowAuthTypes.map((authType) => (
                                        <SelectItem key={authType} value={authType}>
                                            {getAuthTypeName(authType)}
                                        </SelectItem>
                                    ))
                                }
                            </SelectContent>
                        </Select>
                        <FormDescription>
                            The type of authentication to use.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
            {showCredFields && <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                            <Input placeholder="account username" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />}
            {showCredFields && <FormField
                control={form.control}
                name="secret"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                            <Input type='password' placeholder={
                                hasPreviousPassword ? '********' : 'account password'
                            } {...field} />
                        </FormControl>
                        {
                            hasPreviousPassword && <FormDescription>
                                Previous password is hidden, leave blank if you don't want to change.
                            </FormDescription>
                        }
                        <FormMessage />
                    </FormItem>
                )}
            />}
            <div className='flex justify-center items-center space-x-2'>
            {!existingStorage && <Button variant="secondary" size='lg' onClick={onCancel}>Cancel</Button>}
                <Button size='lg' type="submit">{
                    existingStorage ? 'Save changes' : 'Add'
                }</Button>
            </div>
        </form>
    </Form>)
}

export interface StorageFormProps {
    storageType: StorageType;
    existingStorage?: Storage;
    onCancel: () => void;
    onSuccess: (storage: Storage) => void;
}

export default function StorageForm({
    storageType,
    existingStorage,
    onCancel,
    onSuccess,
}: StorageFormProps) {
    const isOneAuth = isOneAuthSupported(storageType);

    if (isOneAuth) {
        return (<OneAuthForm storageType={storageType} onCancel={onCancel} existingStorage={existingStorage} onSuccess={onSuccess} />)
    }

    return (<StorageFormManual storageType={storageType} onCancel={onCancel} existingStorage={existingStorage} onSuccess={onSuccess} />)
}

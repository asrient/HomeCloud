import { useForm } from 'react-hook-form';
import * as z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    errorToFormError,
    FormRootError,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { useCallback } from 'react';
import { login, LoginParams } from '@/lib/api/auth';


const loginFormSchema = z.object({
    username: z.string().min(2).max(50),
    password: z.string().max(50),
})

export default function LoginForm({
    onLoginSucess,
}: {
    onLoginSucess: () => void
}) {

    const form = useForm<z.infer<typeof loginFormSchema>>({
        resolver: zodResolver(loginFormSchema),
        defaultValues: {
            username: "",
            password: "",
        },
    });

    function onFormSubmit(values: z.infer<typeof loginFormSchema>) {
        // This will be type-safe and validated.
        console.log(values);
        const params: LoginParams = {
            username: values.username,
        };
        if (!!values.password) {
            params.password = values.password;
        }
        performLogin(params);
    }

    const performLogin = useCallback(async (params: LoginParams) => {
        try {
            await login(params);
        } catch (error: any) {
            console.error(error);
            errorToFormError(error, form);
            return;
        }
        onLoginSucess();
    }, [form, onLoginSucess]);

    return (
        <>
            <Form {...form}>
                <FormMessage />
                <FormRootError />
                <form onSubmit={form.handleSubmit(onFormSubmit)} className="space-y-8">
                    <FormField
                        control={form.control}
                        name="username"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Username</FormLabel>
                                <FormControl>
                                    <Input placeholder="username" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Password</FormLabel>
                                <FormControl>
                                    <Input type='password' placeholder="password" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit">Login</Button>
                </form>
            </Form>
        </>
    )
}

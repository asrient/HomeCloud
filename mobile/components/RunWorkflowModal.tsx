import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, ScrollView } from 'react-native';
import { WorkflowConfig, WorkflowInputField, WorkflowInputs } from 'shared/types';
import { UITextInput } from './ui/UITextInput';
import { UIButton } from './ui/UIButton';
import { UIPageSheet } from './ui/UIPageSheet';
import { Section, Line, FormContainer } from './ui/UIFormPrimatives';

function buildDefaults(fields: WorkflowInputField[]): WorkflowInputs {
    const inputs: WorkflowInputs = {};
    for (const f of fields) {
        if (f.defaultValue !== undefined && f.defaultValue !== null) {
            inputs[f.name] = f.defaultValue;
        } else if (f.type === 'boolean') {
            inputs[f.name] = false;
        }
    }
    return inputs;
}

function InputRow({ field, value, onChange }: {
    field: WorkflowInputField;
    value: string | number | boolean | undefined;
    onChange: (v: string | number | boolean) => void;
}) {
    const label = field.name + (field.isRequired ? ' *' : '');

    if (field.type === 'boolean') {
        const current = value === true || value === 'true';
        return (
            <Line title={label} value={current ? 'True' : 'False'} onPress={() => onChange(!current)} />
        );
    }

    if (field.type === 'select' && field.options) {
        const current = String(value ?? '');
        return (
            <Line title={label} value={current || 'Select…'} onPress={() => {
                const opts = field.options!.filter(o => o.trim());
                const idx = opts.indexOf(current);
                const next = opts[(idx + 1) % opts.length];
                if (next) onChange(next);
            }} />
        );
    }

    return (
        <Line title={label}>
            <UITextInput
                variant="plain"
                value={String(value ?? '')}
                onChangeText={v => onChange(field.type === 'number' ? Number(v) : v)}
                placeholder={field.defaultValue !== undefined ? String(field.defaultValue) : 'Enter value'}
                keyboardType={field.type === 'number' ? 'numeric' : 'default'}
                style={styles.lineInput}
            />
        </Line>
    );
}

export function RunWorkflowModal({
    workflow,
    visible,
    onClose,
    onRun,
}: {
    workflow: WorkflowConfig | null;
    visible: boolean;
    onClose: () => void;
    onRun: (inputs: WorkflowInputs) => void;
}) {
    const [inputs, setInputs] = useState<WorkflowInputs>({});

    useEffect(() => {
        if (workflow && visible) {
            setInputs(buildDefaults(workflow.inputFields ?? []));
        }
    }, [workflow, visible]);

    const setValue = useCallback((name: string, value: string | number | boolean) => {
        setInputs(prev => ({ ...prev, [name]: value }));
    }, []);

    const handleRun = useCallback(() => {
        onRun(inputs);
        onClose();
    }, [inputs, onRun, onClose]);

    if (!workflow) return null;
    const fields = workflow.inputFields ?? [];

    const canRun = fields.every(f => {
        if (!f.isRequired) return true;
        const v = inputs[f.name];
        return v !== undefined && v !== null && v !== '';
    });

    return (
        <UIPageSheet
            isOpen={visible}
            onClose={onClose}
            title={workflow.name}
            headerButtons={
                <UIButton type="secondary" icon="checkmark" onPress={handleRun} disabled={!canRun} themeColor="highlight" />
            }
        >
            <ScrollView
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 20 }}
            >
                <FormContainer>
                    <Section title="Run Parameters">
                        {fields.map(field => (
                            <InputRow
                                key={field.name}
                                field={field}
                                value={inputs[field.name]}
                                onChange={v => setValue(field.name, v)}
                            />
                        ))}
                    </Section>
                </FormContainer>
            </ScrollView>
        </UIPageSheet>
    );
}

const styles = StyleSheet.create({
    lineInput: {
        flex: 2/3,
        textAlign: 'right',
    },
});

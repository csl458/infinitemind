import { useEffect, useRef, useState, type ChangeEvent, type CompositionEvent } from 'react'

type TextFieldElement = HTMLInputElement | HTMLTextAreaElement

type ImeSafeField = {
  value: string
  onChange: (event: ChangeEvent<TextFieldElement>) => void
  onCompositionStart: () => void
  onCompositionEnd: (event: CompositionEvent<TextFieldElement>) => void
  onBlur: () => void
}

export function useImeSafeField(
  externalValue: string,
  onCommit: (nextValue: string) => void,
): ImeSafeField {
  const [draftValue, setDraftValue] = useState(externalValue)
  const isComposingRef = useRef(false)
  const externalValueRef = useRef(externalValue)

  useEffect(() => {
    externalValueRef.current = externalValue

    if (!isComposingRef.current) {
      setDraftValue(externalValue)
    }
  }, [externalValue])

  function commit(nextValue: string) {
    if (nextValue === externalValueRef.current) {
      return
    }

    onCommit(nextValue)
  }

  function onChange(event: ChangeEvent<TextFieldElement>) {
    const nextValue = event.target.value

    setDraftValue(nextValue)

    if (!isComposingRef.current) {
      commit(nextValue)
    }
  }

  function onCompositionStart() {
    isComposingRef.current = true
  }

  function onCompositionEnd(event: CompositionEvent<TextFieldElement>) {
    const nextValue = event.currentTarget.value

    isComposingRef.current = false
    setDraftValue(nextValue)
    commit(nextValue)
  }

  function onBlur() {
    if (isComposingRef.current) {
      return
    }

    commit(draftValue)
  }

  return {
    value: draftValue,
    onChange,
    onCompositionStart,
    onCompositionEnd,
    onBlur,
  }
}
/**
 * LockableNumberInput component
 * A reusable number input with up/down increment buttons and a lock toggle
 */

import React from 'react';
import {
  TextField,
  IconButton,
  Box,
} from '@mui/material';
import {
  KeyboardArrowUp,
  KeyboardArrowDown,
  Lock,
  LockOpen,
} from '@mui/icons-material';

interface LockableNumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onIncrement: () => void;
  onDecrement: () => void;
  lockable: boolean;
  locked: boolean;
  onToggleLock: () => void;
  width?: number;
}

export const LockableNumberInput: React.FC<LockableNumberInputProps> = ({
  label,
  value,
  onChange,
  onIncrement,
  onDecrement,
  lockable,
  locked,
  onToggleLock,
  width = 100,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    if (!isNaN(newValue)) {
      onChange(newValue);
    }
  };

  return (
    <TextField
      label={label}
      type="number"
      value={value}
      onChange={handleChange}
      size="small"
      sx={{
        width,
        '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
          '-webkit-appearance': 'none',
          margin: 0,
        },
        '& input[type=number]': {
          '-moz-appearance': 'textfield',
        },
      }}
      InputProps={{
        endAdornment: (
          <Box sx={{ display: 'flex', flexDirection: 'row', mr: -1 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', mr: 1 }}>
              <IconButton size="small" color="secondary" onClick={onIncrement} sx={{ p: 0, fontSize: '18px' }} disabled={locked}>
                <KeyboardArrowUp fontSize="inherit" sx={{my: -0.25}} />
              </IconButton>
              <IconButton size="small" color="secondary" onClick={onDecrement} sx={{ p: 0, fontSize: '18px' }} disabled={locked}>
                <KeyboardArrowDown fontSize="inherit" sx={{my: -0.25}} />
              </IconButton>
            </Box>
            {lockable && (
              <IconButton size="medium" onClick={onToggleLock} sx={{ p: 0, ml: -0.5 }}>
                {locked ? <Lock fontSize="inherit" /> : <LockOpen fontSize="inherit" />}
              </IconButton>
            )}
          </Box>
        ),
      }}
    />
  );
};

export default LockableNumberInput;
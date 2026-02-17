/**
 * NumberInput component
 * A reusable number input with up/down increment buttons
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
} from '@mui/icons-material';

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onIncrement: () => void;
  onDecrement: () => void;
  width?: number;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  label,
  value,
  onChange,
  onIncrement,
  onDecrement,
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
          <Box sx={{ display: 'flex', flexDirection: 'column', mr: -1 }}>
            <IconButton size="small" color="secondary" onClick={onIncrement} sx={{ p: 0, fontSize: '18px' }}>
              <KeyboardArrowUp fontSize="inherit" sx={{my: -0.25}} />
            </IconButton>
            <IconButton size="small" color="secondary" onClick={onDecrement} sx={{ p: 0, fontSize: '18px' }}>
              <KeyboardArrowDown fontSize="inherit" sx={{my: -0.25}} />
            </IconButton>
          </Box>
        ),
      }}
    />
  );
};

export default NumberInput;
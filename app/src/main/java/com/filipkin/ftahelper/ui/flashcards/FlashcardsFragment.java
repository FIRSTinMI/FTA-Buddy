package com.filipkin.ftahelper.ui.flashcards;

import android.content.SharedPreferences;
import android.os.Bundle;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;

import com.filipkin.ftahelper.R;
import com.filipkin.ftahelper.databinding.FragmentFlashcardsBinding;
import com.google.android.material.button.MaterialButton;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class FlashcardsFragment extends Fragment {

    private FragmentFlashcardsBinding binding;

    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        binding = FragmentFlashcardsBinding.inflate(inflater, container, false);
        View root = binding.getRoot();

        binding.flashcardDisplay.setOnClickListener(c -> {
            binding.flashcardDisplay.setVisibility(View.GONE);
            binding.flashcardButtons.setVisibility(View.VISIBLE);
        });

        // TODO: Create a way to add and remove your own flashcards
        SharedPreferences flashcardPrefs = requireContext().getSharedPreferences("flashcards", 0);
        Set<String> flashcards = flashcardPrefs.getStringSet("flashcards", new HashSet<>(Arrays.asList(root.getResources().getStringArray(R.array.default_flashcards))));

        LinearLayout layout = binding.flashcardButtons;

        for (String flashcard : flashcards) {
            Button btnTag = new MaterialButton(root.getContext());
            btnTag.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
            btnTag.setText(flashcard);

            btnTag.setOnClickListener(c -> {
                binding.flashcardButtons.setVisibility(View.GONE);
                binding.flashcardDisplay.setVisibility(View.VISIBLE);
                binding.flashcardText.setText(flashcard);
            });

            layout.addView(btnTag);
        }


        return root;
    }
}
package com.example.demo.service;

import com.example.demo.entity.User;
import com.example.demo.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional
    public User findOrCreateNaverUser(String providerId, String email, String name, String birthyear) {
        String provider = "NAVER";

        User user = userRepository.findByProviderAndProviderId(provider, providerId)
                .orElseGet(() -> User.builder()
                        .provider(provider)
                        .providerId(providerId)
                        .email(email)
                        .name(name)
                        .birthyear(birthyear)
                        .build());

        // 로그인할 때마다 최신 프로필로 갱신(선택)
        user.updateProfile(email, name, birthyear);

        return userRepository.save(user);
    }
}